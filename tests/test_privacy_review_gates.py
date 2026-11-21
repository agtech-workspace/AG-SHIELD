"""Static privacy-by-default checks. These do NOT certify legal compliance."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
GATE = (ROOT / "supabase/functions/risk-check/index.ts").read_text()
SDK = (ROOT / "sdk/src/index.ts").read_text()

class TestPrivacyReviewGates(unittest.TestCase):
    def test_no_wildcard_cors_in_gateway_and_cache_disabled(self):
        self.assertNotIn("'Access-Control-Allow-Origin': '*'", GATE)
        self.assertIn("AG_SHIELD_ALLOWED_ORIGINS", GATE)
        self.assertIn("'Cache-Control': 'no-store, private'", GATE)
    def test_sdk_does_not_copy_raw_upstream_error_to_message(self):
        self.assertNotIn("const detail = typeof body.error", SDK)
        self.assertIn("Risk API request failed (HTTP ${response.status})", SDK)
    def test_all_regulatory_evidence_templates_are_explicitly_unapproved(self):
        for fn in ("REGULATORY-COMPLIANCE-AUDIT-2026-11-16.md", "DPIA-DRAFT-UNSIGNED.md", "DATA-INVENTORY-RETENTION-ROPA.md", "PARTNER-DPA-AND-CBN-GATE.md", "DATA-SUBJECT-REDRESS-PROCESS.md", "BREACH-RESPONSE-PLAYBOOK.md"):
            content=(ROOT / 'docs' / fn).read_text()
            self.assertTrue(any(word in content.upper() for word in ("DRAFT", "NOT CERTIFIED", "NOT APPROVED", "UNAPPROVED", "NOT OPERATIONAL")), fn)
    def test_privilege_migration_remains_review_only(self):
        self.assertTrue((ROOT / "docs/proposed-migrations/20261120000001_api_rpc_permissions.sql").exists())
        self.assertFalse((ROOT / "supabase/migrations/20261120000001_api_rpc_permissions.sql").exists())

if __name__ == '__main__':
    unittest.main()
