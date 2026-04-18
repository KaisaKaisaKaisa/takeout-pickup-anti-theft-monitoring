from pywebpush import generate_vapid_keypair

public_key, private_key = generate_vapid_keypair()
print("VAPID_PUBLIC_KEY=", public_key)
print("VAPID_PRIVATE_KEY=", private_key)
