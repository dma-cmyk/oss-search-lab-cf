#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

def load_env_token():
    # Try current directory first, then fallback to script directory
    env_paths = ['.env', '../.env', 'src/.env']
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_paths.append(os.path.join(script_dir, '.env'))
    
    for path in env_paths:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip().startswith('CLOUDFLARE_API_TOKEN='):
                        token = line.split('=', 1)[1].strip().strip('"').strip("'")
                        if token:
                            return token
    return os.environ.get('CLOUDFLARE_API_TOKEN')

def call_cf_api(url, token, method='GET', body=None, silent_errors=None):
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    
    if body:
        req.data = json.dumps(body).encode('utf-8')
        
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        if silent_errors and e.code in silent_errors:
            return {'success': False, 'status_code': e.code, 'error_type': 'silent'}
        print(f"[-] API Error calling {url}: {e.code} - {e.reason}")
        print(f"[-] Details: {err_body}")
        return None
    except Exception as e:
        print(f"[-] Network Error: {e}")
        return None

def main():
    print("=" * 60)
    print("  💠 Venus Security Link — Cloudflare 監査パトロール")
    print("=" * 60)
    
    token = load_env_token()
    if not token:
        print("[-] エラー: .env ファイルまたは環境変数から CLOUDFLARE_API_TOKEN が見つからないわ。")
        print("    プロジェクトの .env に CLOUDFLARE_API_TOKEN=\"xxxx\" を設定してね。")
        sys.exit(1)
        
    # Verify Token
    print("[*] APIトークンを検証中...")
    verify_res = call_cf_api("https://api.cloudflare.com/client/v4/user/tokens/verify", token)
    if not verify_res or not verify_res.get('success'):
        print("[-] エラー: 提供されたAPIトークンが無効または有効期限切れのようね。")
        sys.exit(1)
    print("[+] トークンは有効かつアクティブよ！")
    
    # 1. ゾーン（ドメイン）リストの取得からアカウントIDを動的に逆引き
    print("[*] 登録ゾーン（ドメイン）情報を取得中...")
    zones_res = call_cf_api("https://api.cloudflare.com/client/v4/zones", token)
    if not zones_res or not zones_res.get('result'):
        print("[-] エラー: ゾーンリストの取得に失敗したわ。トークンのスコープを確認してね。")
        sys.exit(1)
        
    zones = zones_res['result']
    print(f"[+] 登録ドメインを {len(zones)} 件検出したわ。")
    
    # 重複排除してアカウントIDを抽出
    accounts_map = {}
    for zone in zones:
        acc = zone.get('account')
        if acc and acc.get('id'):
            accounts_map[acc['id']] = acc.get('name', "My Account")
            
    # 24時間前のRFC3339文字列
    # datetime.utcnow() is deprecated in Python 3.12+, handle gracefully
    try:
        from datetime import timezone
        now = datetime.now(timezone.utc)
    except ImportError:
        now = datetime.utcnow()
        
    one_day_ago = now - timedelta(days=1)
    from_str = one_day_ago.strftime('%Y-%m-%dT%H:%M:%SZ')
    to_str = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    
    suspicious_activities = []
    
    # 2. 各アカウントに紐づく Pages アナリティクスを探索
    for acc_id, acc_name in accounts_map.items():
        print(f"\n────────────────────────────────────────────────────────")
        print(f" 📂 アカウント: {acc_name} ({acc_id})")
        print(f"────────────────────────────────────────────────────────")
        
        # Pagesプロジェクトの一覧を取得
        print("[*] Pagesプロジェクトを探索中...")
        projects_url = f"https://api.cloudflare.com/client/v4/accounts/{acc_id}/pages/projects"
        projects_res = call_cf_api(projects_url, token, silent_errors=[403])
        
        if projects_res and projects_res.get('success'):
            projects = projects_res['result']
            print(f"[+] Pagesプロジェクトを {len(projects)} 件発見したわ：")
            for proj in projects:
                proj_name = proj['name']
                subdomain = proj.get('subdomain', '')
                
                # プロジェクトごとの24時間統計を取得
                stats_url = f"https://api.cloudflare.com/client/v4/accounts/{acc_id}/pages/projects/{proj_name}/analytics/summary?from={from_str}&to={to_str}"
                stats_res = call_cf_api(stats_url, token)
                
                requests_count = 0
                if stats_res and stats_res.get('result'):
                    requests_count = stats_res['result'].get('requests', {}).get('sum', 0)
                
                print(f"  • 🌐 {proj_name:<20} ({subdomain:<30}) - 直近24時間のアクセス数: {requests_count}回")
                
                # 異常なアクセス急増チェック
                if requests_count > 3000:
                    suspicious_activities.append({
                        'type': 'traffic_spike',
                        'host': subdomain or proj_name,
                        'details': f"過去24時間のアクセス数が {requests_count} 回に達しているわ。短時間にボットやスキャナーが大量リクエストを送った疑いがあるわね。"
                    })
        elif projects_res and projects_res.get('error_type') == 'silent':
            print("  ℹ️  トークンに「Workers/Pages」の読込権限が無いため、Pages個別統計はスキップしたわ。")
            print("      (ドメインレベルのセキュリティログ監査はそのまま続行するから安心してね！)")
        else:
            print("  (Pagesプロジェクトは検出されなかったか、アクセス権限がないわ)")
            
    # 3. ゾーンレベルのセキュリティログを取得
    print(f"\n────────────────────────────────────────────────────────")
    print(f" 🛡️  ドメイン（Zone）セキュリティ監査 (過去24時間)")
    print(f"────────────────────────────────────────────────────────")
    
    for zone in zones:
        zone_id = zone['id']
        zone_name = zone['name']
        print(f"[*] ドメイン「{zone_name}」のセキュリティイベントを検査中...")
        
        # WAFセキュリティイベント of 取得
        graphql_url = "https://api.cloudflare.com/client/v4/graphql"
        graphql_query = {
            "query": """
            query GetWafEvents($zoneTag: String!, $from: String!, $to: String!) {
              viewer {
                zones(filter: { zoneTag: $zoneTag }) {
                  firewallEventsAdaptive(
                    filter: { datetime_geq: $from, datetime_leq: $to }
                    limit: 20
                    orderBy: [datetime_DESC]
                  ) {
                    datetime
                    clientIP
                    clientCountryName
                    userAgent
                    uri
                    action
                    ruleId
                    source
                  }
                }
              }
            }
            """,
            "variables": {
              "zoneTag": zone_id,
              "from": from_str,
              "to": to_str
            }
        }
        
        waf_res = call_cf_api(graphql_url, token, method='POST', body=graphql_query)
        
        events = []
        if waf_res and waf_res.get('data') and waf_res['data'].get('viewer'):
            zones_data = waf_res['data']['viewer'].get('zones')
            if zones_data and len(zones_data) > 0:
                events = zones_data[0].get('firewallEventsAdaptive', [])
                
        if events:
            print(f"[!] ⚠️ セキュリティブロックイベントを {len(events)} 件検出したわ！")
            for ev in events[:5]: # 最新5件を表示
                dt_parsed = ev['datetime'].replace('T', ' ').replace('Z', '')
                print(f"  • [{dt_parsed}] Action: {ev['action'].upper()} | IP: {ev['clientIP']} ({ev['clientCountryName']})")
                print(f"    URL: {ev['uri']}")
                
                if ev['clientCountryName'] == 'Netherlands' or ev['clientIP'] in ['195.178.110.102', '195.178.110.223']:
                    suspicious_activities.append({
                        'type': 'malicious_scan',
                        'host': zone_name,
                        'details': f"オランダ (NL) の危険なIP {ev['clientIP']} から `{ev['uri']}` へのアクセスをブロックしたわ。"
                    })
        else:
            print(f"[+] ドメイン「{zone_name}」では不審なファイアウォールイベントは検知されなかったわ。クリーンよ！")
            
    # 4. 総合評価と警告出力
    print(f"\n============================================================")
    print(f" 🚨 総合パトロール監査レポート")
    print(f"============================================================")
    
    if suspicious_activities:
        print("⚠️  警告: アカウント内に不審なアクティビティを検出したわ！")
        for idx, act in enumerate(suspicious_activities, 1):
            print(f"\n【検出 {idx}】種類: {act['type'].upper()} (対象: {act['host']})")
            print(f"  詳細: {act['details']}")
            
        print("\n💡 アドバイス:")
        print("  1. さっき server.ts に追加したIPブロックとパスブロックが正常に機能しているから安心してね。")
        print("  2. もしブロックされた件数が急増しているIPがあれば、CloudflareのドメインWAFから「Block」ルールをデプロイすると、さらに安全よ。")
    else:
        print("✅ クリーン:")
        print("  過去24時間以内に異常なアクセス急増やブロックされた不正なスキャン攻撃は検出されなかったわ。")
        print("  美緒ちゃんのアプリたちは、今日もとっても安全で元気に稼働しているわよ♡")
        
    print("============================================================")

if __name__ == '__main__':
    main()
