"""The final invoice PDF's line items must add up to the quote's own subtotal.

Regression guard: addons were missing from the item list, so any quote with addons printed
line items that summed to less than the total shown at the bottom of the same invoice
(FFT-2026-0002 was off by $441.80).
"""

from types import SimpleNamespace

from app.api.v1.admin.installations import final_invoice_items


def _quote(**kw):
    base = dict(
        base_price=899.00,
        extra_distance_meters=0.0,
        extra_distance_cost=0.00,
        permit_fee=0.00,
        survey_credit=0.00,
        addons=[],
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _sum(items):
    return round(sum(i["amount"] for i in items), 2)


def test_items_sum_to_subtotal_with_addons():
    # The real FFT-2026-0002 quote v2: 899 + 272.94 + 18.86 + 150 = 1340.80
    quote = _quote(addons=[
        SimpleNamespace(name="Parts & materials", price=272.94),
        SimpleNamespace(name="Parts - lugs & copper anti-oxidant compound", price=18.86),
        SimpleNamespace(name="Additional on-site labour", price=150.00),
    ])
    items = final_invoice_items(quote)
    assert _sum(items) == 1340.80
    assert [i["description"] for i in items] == [
        "EV charger installation",
        "Parts & materials",
        "Parts - lugs & copper anti-oxidant compound",
        "Additional on-site labour",
        "Permit fee",
    ]


def test_items_sum_to_subtotal_with_every_term():
    quote = _quote(
        extra_distance_meters=8.0,
        extra_distance_cost=240.00,
        permit_fee=349.00,
        survey_credit=99.00,
        addons=[SimpleNamespace(name="Conduit", price=60.00)],
    )
    # 899 + 240 + 60 + 349 - 99
    assert _sum(final_invoice_items(quote)) == 1449.00


def test_zero_permit_fee_still_listed_and_credit_omitted_when_zero():
    items = final_invoice_items(_quote())
    assert _sum(items) == 899.00
    assert [i["description"] for i in items] == ["EV charger installation", "Permit fee"]
