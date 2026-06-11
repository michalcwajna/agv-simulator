from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aps_client_id: str
    aps_client_secret: str
    aps_bucket_key: str = "agv-simulator-tmp"

    class Config:
        env_file = ".env"


settings = Settings()
