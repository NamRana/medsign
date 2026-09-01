from fastapi.testclient import TestClient


def test_health_endpoint():
    import os
    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("SUPABASE_ANON_KEY", "test-key")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost/test")
    os.environ.setdefault("GEMINI_API_KEY", "test-key")

    from app.main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
