import httpx
from supabase import ClientOptions, create_client

from app.config import settings

_httpx_client = httpx.Client(verify=False) if settings.environment == "development" else None

supabase = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
    options=ClientOptions(httpx_client=_httpx_client) if _httpx_client else ClientOptions(),
)
