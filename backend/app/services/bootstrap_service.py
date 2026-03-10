from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import AdminRole, AdminUser, ChargerBrand, SystemSetting
from app.services.security import hash_password


DEFAULT_BRANDS = [
    "Tesla Wall Connector",
    "ChargePoint Home Flex",
    "Grizzl-E",
    "Emporia",
    "Wallbox Pulsar Plus",
    "Autel MaxiCharger",
    "JuiceBox",
    "Lectron V-Box",
    # Use explicit unicode escapes to avoid Windows encoding issues when editing the file.
    "\u5176\u4ed6\uff08\u8bf7\u6ce8\u660e\uff09",
    "\u8fd8\u6ca1\u4e70 / \u9700\u8981\u63a8\u8350",
]

DEFAULT_SETTINGS_KEY = "pricing_defaults"
DEFAULT_SETTINGS_VALUE = {
    "surface_mount_base_price": 699.00,
    "concealed_base_price": 849.00,
    "surface_mount_per_meter": 30.00,
    "concealed_per_meter": 55.00,
    "permit_fee": 349.00,
    "survey_deposit": 99.00,
    "gst_rate": 5.00,
    "base_distance_included": 5,
}

DEFAULT_EMAIL_TEMPLATES_KEY = "email_templates"
DEFAULT_SMS_TEMPLATES_KEY = "sms_templates"

DEFAULT_EMAIL_TEMPLATES_VALUE = {
    "submission_confirm": {
        "subject": "We received your EV charger quote request",
        "html": "{% extends \"base.html\" %}{% block content %}<h2 style=\"margin:0 0 8px 0;\">We received your request</h2><p class=\"muted\" style=\"margin:0 0 12px 0;\">Thanks {{ nickname }}. Your case reference number is <strong>{{ reference_number }}</strong>.</p><p style=\"margin:0 0 12px 0;\">You can track status here: <a class=\"btn\" href=\"{{ status_url }}\">View status</a></p><p class=\"muted small\" style=\"margin:0;\">Next step: we will contact you to confirm a Site Survey time.</p>{% endblock %}",
    },
    "survey_scheduled": {
        "subject": "Your EV charger site survey is scheduled",
        "html": "{% extends \"base.html\" %}{% block content %}<h2 style=\"margin:0 0 8px 0;\">Site Survey scheduled</h2><p class=\"muted\" style=\"margin:0 0 12px 0;\">Hi {{ nickname }}, your EV charger site survey is scheduled for <strong>{{ scheduled_text }}</strong>.</p><p style=\"margin:0 0 12px 0;\">Please confirm and pay the ${{ deposit_amount }} deposit here: <a class=\"btn\" href=\"{{ pay_url }}\">Pay deposit</a></p><p class=\"muted small\" style=\"margin:0;\">If you proceed with installation, this deposit will be credited toward your final invoice.</p>{% endblock %}",
    },
    "quote_ready": {
        "subject": "Your EV charger installation quote is ready",
        "html": "{% extends \"base.html\" %}{% block content %}<h2 style=\"margin:0 0 8px 0;\">Your quote is ready</h2><p class=\"muted\" style=\"margin:0 0 12px 0;\">Hi {{ nickname }}, your installation quote is ready to review.</p><p style=\"margin:0 0 12px 0;\"><a class=\"btn\" href=\"{{ quote_url }}\">View quote</a></p><p class=\"muted small\" style=\"margin:0;\">Case: {{ reference_number }}</p>{% endblock %}",
    },
    "installation_scheduled": {
        "subject": "Your EV charger installation is scheduled",
        "html": "{% extends \"base.html\" %}{% block content %}<h2 style=\"margin:0 0 8px 0;\">Installation scheduled</h2><p class=\"muted\" style=\"margin:0 0 12px 0;\">Hi {{ nickname }}, your installation is scheduled for <strong>{{ scheduled_text }}</strong>.</p><p style=\"margin:0 0 12px 0;\">Track progress here: <a class=\"btn\" href=\"{{ status_url }}\">View status</a></p>{% endblock %}",
    },
    "completion": {
        "subject": "Your EV charger installation is completed",
        "html": "{% extends \"base.html\" %}{% block content %}<h2 style=\"margin:0 0 8px 0;\">Project completed</h2><p class=\"muted\" style=\"margin:0 0 12px 0;\">Hi {{ nickname }}, thank you for choosing FFT. Your EV charger installation is completed.</p><div class=\"muted small\" style=\"margin: 12px 0;\"><div><strong>Case</strong>: {{ reference_number }}</div><div><strong>Workmanship warranty</strong>: 1 year</div></div><h3 style=\"margin: 14px 0 6px 0; font-size: 14px;\">Key terms</h3><ol class=\"muted small\" style=\"margin: 0 0 12px 16px; padding:0;\"><li>Panel capacity is assumed sufficient; upgrades or EVEMS/DCC (if required) are quoted separately.</li><li>Drywall/patching/painting is not included for concealed wiring.</li><li>Pre-existing code violations identified during inspection are the customer’s responsibility.</li><li>Hardware is customer-supplied; FFT covers workmanship only.</li></ol><p class=\"muted small\" style=\"margin:0;\">If you have any questions, just reply to this email.</p>{% endblock %}",
    },
    "survey_deposit_received": {
        "subject": "We received your survey deposit",
        "html": "{% extends \"base.html\" %}{% block content %}<h2 style=\"margin:0 0 8px 0;\">Deposit received</h2><p class=\"muted\" style=\"margin:0 0 12px 0;\">Hi {{ nickname }}, we received your site survey deposit. Thank you!</p><p style=\"margin:0 0 12px 0;\">You can track status here: <a class=\"btn\" href=\"{{ status_url }}\">View status</a></p><p class=\"muted small\" style=\"margin:0;\">Case: {{ reference_number }}</p>{% endblock %}",
    },
}

DEFAULT_SMS_TEMPLATES_VALUE = {
    "submission_confirm": {
        "body": "[FFT] Hi {{ nickname }}, we received your request. Track status: {{ status_url }}",
    },
    "survey_scheduled": {
        "body": "[FFT] Hi {{ nickname }}, your site survey is scheduled for {{ scheduled_text }}. Please pay the deposit here: {{ pay_url }}",
    },
    "quote_ready": {
        "body": "[FFT] Hi {{ nickname }}, your quote is ready: {{ quote_url }}",
    },
    "installation_scheduled": {
        "body": "[FFT] Installation scheduled for {{ scheduled_text }}. Status: {{ status_url }}",
    },
    "completion": {
        "body": "[FFT] Your installation is completed. Thank you! Case: {{ reference_number }}",
    },
    "survey_deposit_received": {
        "body": "[FFT] Deposit received. Thank you! Case: {{ reference_number }}. Status: {{ status_url }}",
    },
}

DEFAULT_ETRANSFER_SETTINGS_KEY = "etransfer_settings"
DEFAULT_ETRANSFER_SETTINGS_VALUE = {
    "recipient_name": "FutureFrontier Technology",
    "recipient_email": "payments@example.com",
    "instructions": "Please send an Interac e-transfer for the survey deposit amount. Include your case reference number in the message.",
}


def ensure_defaults(db: Session) -> None:
    _ensure_charger_brands(db)
    _ensure_system_settings(db)
    _ensure_etransfer_settings(db)
    _ensure_message_templates(db)
    _ensure_bootstrap_super_admin(db)
    _ensure_dev_super_admin(db)


def _ensure_charger_brands(db: Session) -> None:
    existing = db.execute(select(ChargerBrand.id).limit(1)).first()
    if existing:
        return

    for idx, name in enumerate(DEFAULT_BRANDS, start=1):
        db.add(ChargerBrand(name=name, sort_order=idx, is_active=True))
    db.commit()


def _ensure_system_settings(db: Session) -> None:
    existing = db.execute(select(SystemSetting).where(SystemSetting.key == DEFAULT_SETTINGS_KEY)).scalar_one_or_none()
    if existing:
        return
    db.add(SystemSetting(key=DEFAULT_SETTINGS_KEY, value=DEFAULT_SETTINGS_VALUE))
    db.commit()


def _ensure_etransfer_settings(db: Session) -> None:
    row = db.execute(select(SystemSetting).where(SystemSetting.key == DEFAULT_ETRANSFER_SETTINGS_KEY)).scalar_one_or_none()
    if not row:
        db.add(SystemSetting(key=DEFAULT_ETRANSFER_SETTINGS_KEY, value=DEFAULT_ETRANSFER_SETTINGS_VALUE))
        db.commit()
        return
    # Merge new defaults without overwriting existing edits
    changed = False
    for k, v in DEFAULT_ETRANSFER_SETTINGS_VALUE.items():
        if k not in (row.value or {}):
            row.value[k] = v
            changed = True
    if changed:
        db.add(row)
        db.commit()


def _ensure_message_templates(db: Session) -> None:
    email_row = db.execute(select(SystemSetting).where(SystemSetting.key == DEFAULT_EMAIL_TEMPLATES_KEY)).scalar_one_or_none()
    if not email_row:
        db.add(SystemSetting(key=DEFAULT_EMAIL_TEMPLATES_KEY, value=DEFAULT_EMAIL_TEMPLATES_VALUE))
        db.commit()
    else:
        changed = False
        for k, v in DEFAULT_EMAIL_TEMPLATES_VALUE.items():
            if k not in (email_row.value or {}):
                email_row.value[k] = v
                changed = True
        if changed:
            db.add(email_row)
            db.commit()

    sms_row = db.execute(select(SystemSetting).where(SystemSetting.key == DEFAULT_SMS_TEMPLATES_KEY)).scalar_one_or_none()
    if not sms_row:
        db.add(SystemSetting(key=DEFAULT_SMS_TEMPLATES_KEY, value=DEFAULT_SMS_TEMPLATES_VALUE))
        db.commit()
    else:
        changed = False
        for k, v in DEFAULT_SMS_TEMPLATES_VALUE.items():
            if k not in (sms_row.value or {}):
                sms_row.value[k] = v
                changed = True
        if changed:
            db.add(sms_row)
            db.commit()


def _ensure_bootstrap_super_admin(db: Session) -> None:
    settings = get_settings()
    pw = (settings.bootstrap_admin_password or "").strip()
    if not pw:
        return
    has_user = db.execute(select(AdminUser.id).limit(1)).first()
    if has_user:
        return
    username = (settings.bootstrap_admin_username or "admin").strip()
    email = (settings.bootstrap_admin_email or "admin@example.com").strip()
    db.add(
        AdminUser(
            username=username,
            email=email,
            password_hash=hash_password(pw),
            role=AdminRole.super_admin,
            is_active=True,
        )
    )
    db.commit()


def _ensure_dev_super_admin(db: Session) -> None:
    settings = get_settings()
    if settings.app_env != "development":
        return

    has_user = db.execute(select(AdminUser.id).limit(1)).first()
    if has_user:
        return

    db.add(
        AdminUser(
            username="admin",
            email="admin@example.com",
            password_hash=hash_password("admin1234"),
            role=AdminRole.super_admin,
            is_active=True,
        )
    )
    db.commit()

