import secrets


def generate_access_token() -> str:
    # 32 bytes -> 64 hex chars (matches SKILL.md)
    return secrets.token_hex(32)

