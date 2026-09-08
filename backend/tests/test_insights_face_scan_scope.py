"""Regression tests for profile-scoped wellness data in Insights."""

from app.api.v1.insights import _scope_face_scans_query


class _RecordedQuery:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str | None]] = []

    def eq(self, column: str, value: str):
        self.calls.append(("eq", column, value))
        return self

    def is_(self, column: str, value: str):
        self.calls.append(("is", column, value))
        return self


def test_face_scan_query_uses_the_selected_family_member():
    query = _RecordedQuery()

    result = _scope_face_scans_query(
        query,
        user_id="user-1",
        member_id="family-member-1",
    )

    assert result is query
    assert query.calls == [
        ("eq", "user_id", "user-1"),
        ("eq", "family_member_id", "family-member-1"),
    ]


def test_face_scan_query_keeps_unassigned_scans_on_the_primary_profile():
    query = _RecordedQuery()

    result = _scope_face_scans_query(
        query,
        user_id="user-1",
        member_id=None,
    )

    assert result is query
    assert query.calls == [
        ("eq", "user_id", "user-1"),
        ("is", "family_member_id", "null"),
    ]
