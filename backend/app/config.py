from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_core.core_schema import ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "production", "test"] = Field(
        default="development", validation_alias="APP_ENV"
    )

    secret_key: str = Field(default="dev_secret_key", validation_alias="SECRET_KEY")

    db_user: str = Field(default="ev_charger", validation_alias="DB_USER")
    db_password: str = Field(default="your_secure_password", validation_alias="DB_PASSWORD")
    db_name: str = Field(default="ev_charger_quote", validation_alias="DB_NAME")
    db_host: str = Field(default="localhost", validation_alias="DB_HOST")
    db_port: int = Field(default=5432, validation_alias="DB_PORT")

    frontend_url: str = Field(default="http://localhost:7230", validation_alias="FRONTEND_URL")
    admin_url: str = Field(default="http://localhost:7231", validation_alias="ADMIN_URL")

    brand_short: str = Field(default="FFT", validation_alias="BRAND_SHORT")
    brand_name: str = Field(default="FutureFrontier Technology", validation_alias="BRAND_NAME")
    brand_tagline: str = Field(default="EV Charger Installation • Calgary, AB", validation_alias="BRAND_TAGLINE")
    brand_support_phone: str = Field(default="+14030000000", validation_alias="BRAND_SUPPORT_PHONE")
    brand_logo_url: str | None = Field(default=None, validation_alias="BRAND_LOGO_URL")

    stripe_secret_key: str | None = Field(default=None, validation_alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, validation_alias="STRIPE_WEBHOOK_SECRET")

    twilio_account_sid: str | None = Field(default=None, validation_alias="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str | None = Field(default=None, validation_alias="TWILIO_AUTH_TOKEN")
    twilio_phone_number: str | None = Field(default=None, validation_alias="TWILIO_PHONE_NUMBER")

    smtp_host: str | None = Field(default=None, validation_alias="SMTP_HOST")
    smtp_port: int | None = Field(default=None, validation_alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, validation_alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, validation_alias="SMTP_PASSWORD")
    smtp_from_name: str | None = Field(default=None, validation_alias="SMTP_FROM_NAME")
    smtp_from_email: str | None = Field(default=None, validation_alias="SMTP_FROM_EMAIL")
    smtp_starttls: bool = Field(default=True, validation_alias="SMTP_STARTTLS")
    smtp_use_ssl: bool = Field(default=False, validation_alias="SMTP_USE_SSL")

    # One-time bootstrap admin (recommended for production first run)
    bootstrap_admin_username: str | None = Field(default=None, validation_alias="BOOTSTRAP_ADMIN_USERNAME")
    bootstrap_admin_email: str | None = Field(default=None, validation_alias="BOOTSTRAP_ADMIN_EMAIL")
    bootstrap_admin_password: str | None = Field(default=None, validation_alias="BOOTSTRAP_ADMIN_PASSWORD")

    # Basic auth hardening (in-memory throttling)
    admin_login_window_seconds: int = Field(default=300, validation_alias="ADMIN_LOGIN_WINDOW_SECONDS")
    admin_login_max_attempts: int = Field(default=8, validation_alias="ADMIN_LOGIN_MAX_ATTEMPTS")
    admin_login_block_seconds: int = Field(default=600, validation_alias="ADMIN_LOGIN_BLOCK_SECONDS")

    @field_validator("smtp_port", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("smtp_from_email", "smtp_host", "smtp_user", "smtp_password", "smtp_from_name", mode="before")
    @classmethod
    def _blank_str_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("bootstrap_admin_username", "bootstrap_admin_email", "bootstrap_admin_password", mode="before")
    @classmethod
    def _blank_str_to_none2(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("smtp_starttls", "smtp_use_ssl", mode="before")
    @classmethod
    def _parse_bool(cls, v, info: ValidationInfo):
        if v is None:
            # Use default value
            return True if info.field_name == "smtp_starttls" else False
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return bool(v)
        if isinstance(v, str):
            s = v.strip().lower()
            if s == "":
                return True if info.field_name == "smtp_starttls" else False
            if s in {"1", "true", "yes", "y", "on"}:
                return True
            if s in {"0", "false", "no", "n", "off"}:
                return False
        return v

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

