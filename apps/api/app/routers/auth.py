import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.entities import User
from app.schemas.schemas import RegisterIn, LoginIn, TokenOut

router = APIRouter()

@router.post("/login")
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    result = await db.execute(select(User).where(User.phone == payload.phone))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user.id)
    return TokenOut(access_token=token)

@router.post("/register")
async def register(payload: RegisterIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    exists = await db.execute(select(User).where(User.phone == payload.phone))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone already registered")
    user = User(
        id=uuid.uuid4(),
        phone=payload.phone,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    token = create_access_token(user.id)
    return TokenOut(access_token=token)
