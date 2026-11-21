"""Optional local structural checks, requiring PyYAML. No network or credentials."""
from pathlib import Path
import re
import unittest
import yaml

ROOT = Path(__file__).resolve().parent.parent
DOC = yaml.safe_load((ROOT / 'docs/openapi.yaml').read_text())
SDK = (ROOT / 'sdk/src/index.ts').read_text()
GATEWAY = (ROOT / 'supabase/functions/risk-check/index.ts').read_text()

class TestOpenAPIContract(unittest.TestCase):
    def test_only_evidenced_partner_endpoint(self):
        self.assertEqual(set(DOC['paths']), {'/risk-check'})
        self.assertEqual(set(DOC['paths']['/risk-check']), {'post'})
    def test_api_key_authentication(self):
        self.assertEqual(DOC['components']['securitySchemes']['ApiKeyAuth']['name'], 'X-API-Key')
        self.assertIn('verify:read', DOC['paths']['/risk-check']['post']['description'])
        self.assertIn("'X-API-Key'", SDK)
    def test_request_fields(self):
        props = DOC['components']['schemas']['RiskCheckRequest']['properties']
        self.assertEqual(set(props), {'account_number','bank_name','amount','is_new_recipient','holder_name'})
        self.assertEqual(props['account_number']['pattern'], '^[0-9]{10}$')
        self.assertEqual(set(DOC['components']['schemas']['RiskCheckRequest']['required']), {'account_number','bank_name'})
    def test_response_from_gateway_and_sql(self):
        schema = DOC['components']['schemas']['RiskCheckResponse']
        expected = {'status','risk_level','risk_score','confidence_interval','recommended_action','reasons','source_registry','primary_match_flags','social_proof','execution_time_ms'}
        self.assertEqual(set(schema['properties']), expected)
        self.assertTrue({'status','risk_level','recommended_action','reasons','source_registry','primary_match_flags','execution_time_ms'}.issubset(schema['required']))
        for name in ('reasons','source_registry','primary_match_flags'):
            self.assertEqual(schema['properties'][name]['type'],'array')
            self.assertEqual(schema['properties'][name]['items']['type'],'string')
        self.assertEqual(schema['properties']['social_proof']['type'],'string')
        self.assertEqual(schema['properties']['confidence_interval']['type'],'number')
        self.assertEqual(schema['properties']['risk_score']['maximum'],100)
        self.assertEqual(set(schema['properties']['recommended_action']['enum']), {'ALLOW','REVIEW','BLOCK','FORCE_MANDATORY_SECONDARY_OTP'})
        self.assertIn('FORCE_MANDATORY_SECONDARY_OTP', SDK)
        self.assertIn('FORCE_MANDATORY_SECONDARY_OTP', GATEWAY)
    def test_fail_closed_responses(self):
        errors = {'400','401','403','405','429','500','503'}
        self.assertTrue(errors.issubset(DOC['paths']['/risk-check']['post']['responses']))
        self.assertNotIn('safe', DOC['components']['schemas']['ApiError']['properties'])
        self.assertIn('UNKNOWN', DOC['components']['responses']['ApiError']['description'])
        self.assertIn('AUDIT_LOG_UNAVAILABLE', GATEWAY)
        self.assertIn("readonly decision = 'UNKNOWN'", SDK)

if __name__ == '__main__':
    unittest.main()
