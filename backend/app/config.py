from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    database_url: str
    gemini_api_key: str
    environment: str = "development"
    secret_key: str = "change-me"
    sentry_dsn: str = ""
    posthog_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]

    def model_post_init(self, __context: object) -> None:
        if self.environment == "production" and self.secret_key == "change-me":
            raise ValueError("SECRET_KEY must be set to a real secret in production")

    # MedGemma (optional — enable for superior medical image analysis)
    medgemma_enabled: bool = False
    medgemma_model_id: str = "google/medgemma-4b-it"
    hf_token: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
