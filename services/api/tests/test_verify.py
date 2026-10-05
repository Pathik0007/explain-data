"""The number check that stops the model from stating figures the engine did not compute.
The browser has a JavaScript copy of these rules (client-src/ask.js, E.unverifiedNumbers)."""
from app.ai.verify import unverified_numbers


def test_rounded_and_scaled_numbers_pass():
    results = {"summary": "Revenue 1238492, change 0.1241"}
    assert unverified_numbers("Revenue rose 12.4% to $1.24M in 2025.", results) == []


def test_year_followed_by_comma_is_not_flagged():
    assert unverified_numbers("In 2025, sales grew.", {"x": 1}) == []


def test_sign_dropped_in_prose_still_matches():
    assert unverified_numbers("Satisfaction falls 0.28 points per day.", {"coef": -0.28}) == []


def test_other_currency_symbols():
    assert unverified_numbers("About €54.3K came from Sydney.", {"rows": [["Sydney", 54266]]}) == []


def test_invented_and_derived_numbers_are_flagged():
    results = {"rows": [["Perth", 4.28], ["Adelaide", 2.08]]}
    assert unverified_numbers("Perth averages 4.28 days, a gap of 106%, across 1,250 orders.", results) == ["106%", "1,250"]
