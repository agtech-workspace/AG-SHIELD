from supabase import create_client
import os

async def run_report_settler():
    supabase = create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    result = supabase.rpc('get_escalation_candidates').execute()

    escalated = 0
    for row in (result.data or []):
        acct = row['account_number']
        count = row['unique_reporters']
        bank = row.get('bank_name')

        supabase.table('accounts').upsert({
            'account_number': acct,
            'bank_name': bank,
            'overall_risk_level': 'high_risk',
            'source': 'community',
            'flag_count': count,
            'flagged_reason': f'Auto-escalated: {count} unique community reports'
        }, on_conflict='account_number,bank_name').execute()

        escalated += 1

    print(f"[ReportSettler] Escalated {escalated} accounts")
    return escalated
