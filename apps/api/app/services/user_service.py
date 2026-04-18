import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import User

DEV_PHONE = "dev-user"

async def get_or_create_dev_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.phone == DEV_PHONE))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(
        id=uuid.uuid4(),
        phone=DEV_PHONE,
        name="Dev User",
        password_hash="dev",
    )
    db.add(user)
    await db.flush()
    return user
