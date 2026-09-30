"""SQLAlchemy models. PostgreSQL in production; SQLite for local development."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterator

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import DATABASE_URL


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _):  # noqa: ANN001
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(engine, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    def as_dict(self) -> dict[str, Any]:
        return {c.name: getattr(self, c.key) for c in self.__table__.columns}


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))
    org: Mapped[str | None] = mapped_column(String(200), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    salt: Mapped[str] = mapped_column(String(64))
    api_key_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class SessionToken(Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)
    expires_at: Mapped[str] = mapped_column(String(32))


class Assessment(Base):
    __tablename__ = "assessments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    commodity_id: Mapped[str] = mapped_column(String(60))
    input_json: Mapped[dict] = mapped_column(JSON)
    result_json: Mapped[dict] = mapped_column(JSON)
    engine_version: Mapped[str] = mapped_column(String(120))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("assessments.id"), nullable=True)
    selected_plan_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class QuoteRequest(Base):
    __tablename__ = "quote_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("assessments.id"), nullable=True)
    supplier_id: Mapped[str] = mapped_column(String(60))
    supplier_product_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    kind: Mapped[str] = mapped_column(String(20))
    units: Mapped[int] = mapped_column(Integer)
    size_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="responded-simulated")
    response_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class MaterialLot(Base):
    __tablename__ = "material_lots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    supplier_product_id: Mapped[str] = mapped_column(String(20))
    lot_code: Mapped[str] = mapped_column(String(60))
    received_at: Mapped[str] = mapped_column(String(32))
    units_received: Mapped[int] = mapped_column(Integer)
    receiving_check_json: Mapped[dict] = mapped_column(JSON)
    accepted: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class Batch(Base):
    __tablename__ = "batches"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_token: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    batch_code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    gtin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    producer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("assessments.id"), nullable=True)
    candidate_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendation_version: Mapped[str | None] = mapped_column(String(200), nullable=True)
    commodity_id: Mapped[str] = mapped_column(String(60))
    commodity_name: Mapped[str] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(40), nullable=True)
    origin: Mapped[str | None] = mapped_column(String(160), nullable=True)
    harvest_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    packed_at: Mapped[str] = mapped_column(String(32))
    quantity_kg: Mapped[float] = mapped_column(Float)
    units: Mapped[int] = mapped_column(Integer)
    pack_size_kg: Mapped[float] = mapped_column(Float)
    structure_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    structure_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    oxygen_control: Mapped[str | None] = mapped_column(String(20), nullable=True)
    material_lot_id: Mapped[int | None] = mapped_column(ForeignKey("material_lots.id"), nullable=True)
    supplier_product_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    packing_checks_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    handling_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    parent_batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="packed")
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    origin: Mapped[str] = mapped_column(String(160))
    destination: Mapped[str] = mapped_column(String(160))
    transporter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    receiver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    declared_conditions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="created")
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class ShipmentBatch(Base):
    __tablename__ = "shipment_batches"
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), primary_key=True)
    units: Mapped[int] = mapped_column(Integer)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(20))
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), nullable=True, index=True)
    shipment_id: Mapped[int | None] = mapped_column(ForeignKey("shipments.id"), nullable=True, index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    event_time: Mapped[str] = mapped_column(String(32))
    location: Mapped[str | None] = mapped_column(String(160), nullable=True)
    units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    condition_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class RetailSale(Base):
    __tablename__ = "retail_sales"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    retailer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), nullable=True)
    gtin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    batch_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    unit_serial: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    store: Mapped[str | None] = mapped_column(String(160), nullable=True)
    source: Mapped[str] = mapped_column(String(20))
    sold_at: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class Complaint(Base):
    __tablename__ = "complaints"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), nullable=True, index=True)
    unit_serial: Mapped[str | None] = mapped_column(String(80), nullable=True)
    category: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(Text)
    photos_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="new")
    manufacturer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class Trial(Base):
    __tablename__ = "trials"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("assessments.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    design_json: Mapped[dict] = mapped_column(JSON)
    locked_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lock_hash: Mapped[str | None] = mapped_column(String(16), nullable=True)
    observations_json: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[str] = mapped_column(String(60))
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decision: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class VerifiedExample(Base):
    __tablename__ = "verified_examples"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[str] = mapped_column(String(60))
    commodity_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    product: Mapped[str] = mapped_column(String(120))
    brand: Mapped[str] = mapped_column(String(80))
    photo_path: Mapped[str] = mapped_column(String(300))
    photo_source: Mapped[str] = mapped_column(String(300))
    documented_structure: Mapped[str] = mapped_column(String(300))
    structure_source: Mapped[str] = mapped_column(String(300))
    labelled_shelf_life: Mapped[str | None] = mapped_column(String(120), nullable=True)
    storage_instructions: Mapped[str | None] = mapped_column(String(300), nullable=True)
    source_date: Mapped[str] = mapped_column(String(20))
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class Document(Base):
    """Evidence documents (datasheets, lab reports, photos) kept in object storage."""
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(30))
    key: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
