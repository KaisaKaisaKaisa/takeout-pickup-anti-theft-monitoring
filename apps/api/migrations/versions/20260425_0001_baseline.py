"""baseline schema managed by alembic

Revision ID: 20260425_0001
Revises:
Create Date: 2026-04-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260425_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("default_pickup_window_min", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("phone"),
    )
    op.create_table(
        "edge_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("device_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("device_type", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="offline"),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("device_code"),
    )
    op.create_index("idx_edge_devices_owner_status", "edge_devices", ["owner_user_id", "status"])
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("provider_order_id", sa.String(length=64), nullable=True),
        sa.Column("merchant_name", sa.String(length=128), nullable=True),
        sa.Column("item_summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="created"),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_pickup_by", sa.DateTime(timezone=True), nullable=True),
        sa.Column("monitoring_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("latest_session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("provider", "provider_order_id"),
    )
    op.create_index("idx_orders_user_status_created", "orders", ["user_id", "status", sa.text("created_at DESC")])
    op.create_table(
        "rule_sets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("scope", sa.String(length=16), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_rule_sets_owner_enabled_scope", "rule_sets", ["owner_user_id", "enabled", "scope"])
    op.create_table(
        "rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rule_set_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rule_sets.id"), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("dsl_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False, server_default="alert"),
        sa.Column("action_params", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("cooldown_sec", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_rules_set_event_enabled_priority", "rules", ["rule_set_id", "event_type", "enabled", "priority"])
    op.create_table(
        "order_status_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("from_status", sa.String(length=24), nullable=True),
        sa.Column("to_status", sa.String(length=24), nullable=False),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("event_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_order_status_events_order_time", "order_status_events", ["order_id", sa.text("event_time DESC")])
    op.create_table(
        "monitoring_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("edge_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("edge_devices.id"), nullable=False),
        sa.Column("state", sa.String(length=24), nullable=False, server_default="armed"),
        sa.Column("armed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("pickup_deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("presence_status", sa.String(length=16), nullable=False, server_default="unknown"),
        sa.Column("roi_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sensitivity_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("false_alarm_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_sessions_order_created", "monitoring_sessions", ["order_id", sa.text("created_at DESC")])
    op.create_index("idx_sessions_device_state", "monitoring_sessions", ["edge_device_id", "state"])
    op.create_table(
        "sensor_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("monitoring_sessions.id"), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("edge_devices.id"), nullable=False),
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="info"),
        sa.Column("metrics_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("event_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_sensor_events_session_time", "sensor_events", ["session_id", sa.text("event_time DESC")])
    op.create_index("idx_sensor_events_device_time", "sensor_events", ["device_id", sa.text("event_time DESC")])
    op.create_table(
        "whitelist_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("relation", sa.String(length=32), nullable=True),
        sa.Column("method_type", sa.String(length=24), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "pickup_confirmations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("monitoring_sessions.id"), nullable=False),
        sa.Column("confirmed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("whitelist_profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("whitelist_profiles.id"), nullable=True),
        sa.Column("confirm_method", sa.String(length=24), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "pickup_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("whitelist_profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("whitelist_profiles.id"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("code", sa.String(length=12), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "alert_incidents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("monitoring_sessions.id"), nullable=False),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rules.id"), nullable=True),
        sa.Column("rule_set_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rule_sets.id"), nullable=True),
        sa.Column("alert_type", sa.String(length=24), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False, server_default="warning"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="open"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_alerts_order_time", "alert_incidents", ["order_id", sa.text("triggered_at DESC")])
    op.create_index("idx_alerts_status_level_time", "alert_incidents", ["status", "level", sa.text("triggered_at DESC")])
    op.create_table(
        "rule_match_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rules.id"), nullable=False),
        sa.Column("rule_set_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rule_sets.id"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("monitoring_sessions.id"), nullable=False),
        sa.Column("event_id", sa.BigInteger(), sa.ForeignKey("sensor_events.id"), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metrics_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("action", sa.String(length=32), nullable=False, server_default="alert"),
        sa.Column("suppressed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_rule_match_logs_rule_time", "rule_match_logs", ["rule_id", sa.text("matched_at DESC")])
    op.create_index("idx_rule_match_logs_user_time", "rule_match_logs", ["user_id", sa.text("matched_at DESC")])
    op.create_index("idx_rule_match_logs_user_event_time", "rule_match_logs", ["user_id", "event_type", sa.text("matched_at DESC")])
    op.create_table(
        "media_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("monitoring_sessions.id"), nullable=True),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("alert_incidents.id"), nullable=True),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("storage_provider", sa.String(length=16), nullable=False),
        sa.Column("bucket_name", sa.String(length=64), nullable=True),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("retention_class", sa.String(length=16), nullable=False, server_default="24h"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_media_order_created", "media_assets", ["order_id", sa.text("created_at DESC")])
    op.create_index("idx_media_incident_type", "media_assets", ["incident_id", "media_type"])
    op.create_table(
        "evidence_bundles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("alert_incidents.id"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="generating"),
        sa.Column("zip_media_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media_assets.id"), nullable=True),
        sa.Column("manifest_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=True),
        sa.Column("auth", sa.Text(), nullable=True),
        sa.Column("device_fingerprint", sa.String(length=128), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_push_user_platform", "push_subscriptions", ["user_id", "platform"])
    op.create_table(
        "notification_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("alert_incidents.id"), nullable=True),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("provider_response", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("notification_logs")
    op.drop_table("push_subscriptions")
    op.drop_table("evidence_bundles")
    op.drop_table("media_assets")
    op.drop_table("rule_match_logs")
    op.drop_table("alert_incidents")
    op.drop_table("pickup_codes")
    op.drop_table("pickup_confirmations")
    op.drop_table("whitelist_profiles")
    op.drop_table("sensor_events")
    op.drop_table("monitoring_sessions")
    op.drop_table("order_status_events")
    op.drop_table("rules")
    op.drop_table("rule_sets")
    op.drop_table("orders")
    op.drop_table("edge_devices")
    op.drop_table("users")
