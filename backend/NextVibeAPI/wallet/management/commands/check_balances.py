import time
import requests
import pandas as pd
import matplotlib
# Use 'Agg' backend to safely generate plots on Linux without a GUI/X-server
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path

from django.core.management.base import BaseCommand
from django.conf import settings
from user.models import User

from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn
from rich import box
from rich.panel import Panel
from dotenv import load_dotenv
import os

load_dotenv()

# Comprehensive list of top Solana tokens
TOKENS = {
    # Base Assets
    "SOL": {"mint": "So11111111111111111111111111111111111111112", "decimals": 9},
    "USDC": {"mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "decimals": 6},
    "SKR": {"mint": "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3", "decimals": 6},
    "USDG": {"mint": "C6FQWMidLdyVBpfRot59ZEamkiafXSwyHTS3ZpGpcVGX", "decimals": 6},
    "JUP": {"mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "decimals": 6},

    # Stablecoins
    "USDT": {"mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "decimals": 6},
    "PYUSD": {"mint": "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZzHmZzG88mB", "decimals": 6}, 

    # Liquid Staking Tokens (LSTs)
    "JitoSOL": {"mint": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", "decimals": 9},
    "mSOL": {"mint": "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", "decimals": 9}, 
    "bSOL": {"mint": "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piD1", "decimals": 9}, 
    "INF": {"mint": "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxzbPNpVfHjC4vTGU", "decimals": 9}, 

    # DeFi (DEX, Lending, Oracles)
    "RAY": {"mint": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", "decimals": 6}, 
    "ORCA": {"mint": "orcaEKTdK7LKz57vaAYr9QeNsjigcvaQYjM1b2gNAkZ", "decimals": 6}, 
    "PYTH": {"mint": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3AkTftjAQYCJT5", "decimals": 6}, 
    "JTO": {"mint": "jtojtomepa8beP8AuQc6eY1e1QYVAn5YwR7y9pA2qA6", "decimals": 9}, 
    "KMNO": {"mint": "KMNo3nJsBXUcpJtCQANY3GqEAMyY1F4k4yUvq3G2xW6", "decimals": 6}, 
    "DRIFT": {"mint": "DriFtXqqWn8K7y7n2fXhK25f7HofN1BwL5GzU4z4d4B", "decimals": 6}, 
    "TNSR": {"mint": "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddZ3eVzY", "decimals": 9}, 

    # Infrastructure & DePIN
    "HNT": {"mint": "hntyVP6YFm1Hg25TN9WGLqM12b8CQ3kS2y2Zk71bXn9", "decimals": 8}, 
    "MOBILE": {"mint": "mb1eu7TzEc71KxDpsmsKoucZTyrMEK3y6D4T8V2GgXm", "decimals": 6}, 
    "RENDER": {"mint": "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof", "decimals": 8}, 
    "W": {"mint": "85VBFQYC9TZkfaptCWsjyq8WwJ3x4rM4pA7bJ4A5YmZ5", "decimals": 6}, 
    "NOS": {"mint": "nosXBqwBxWEQupiZA2a4rE5E7Y9Uoz7ZrtzZ9Z1N2Zp", "decimals": 6}, 

    # Memecoins
    "BONK": {"mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "decimals": 5},
    "WIF": {"mint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYtM22BBG6b", "decimals": 6}, 
    "BOME": {"mint": "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82", "decimals": 6}, 
    "POPCAT": {"mint": "7GCihgDB8fe6KNjn2gGZzGqA1T9B9m37Z1s2N2wK1B4N", "decimals": 4},
    "MEW": {"mint": "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", "decimals": 5}, 
    "WEN": {"mint": "WENWENvqqNya429ubB5GzWwQj7C1qA32fA16Ltz1d4X", "decimals": 5},
}


def fetch_token_prices(console: Console) -> dict:
    """
    Fetches live token USD prices using Jupiter Price API v2/v3 with automatic
    fallback to CoinGecko and public endpoints.
    """
    mints = [t["mint"] for t in TOKENS.values()]
    mints_str = ",".join(mints)
    prices = {}

    endpoints = [
        f"https://api.jup.ag/price/v2?ids={mints_str}",
        f"https://lite-api.jup.ag/price/v2?ids={mints_str}",
        f"https://api.jup.ag/price/v3?ids={mints_str}",
    ]

    for url in endpoints:
        try:
            resp = requests.get(url, timeout=8).json()
            data = resp.get("data", resp) if isinstance(resp, dict) else {}
            if isinstance(data, dict) and data:
                for mint, val in data.items():
                    if isinstance(val, dict):
                        p = val.get("price") or val.get("usdPrice")
                        if p is not None:
                            prices[mint] = float(p)
                if prices:
                    console.print(f"[bold green]✓ Fetched {len(prices)} token prices from Jupiter[/bold green]")
                    break
        except Exception:
            continue

    # Fallback to Coingecko for base tokens if Jupiter missed them
    if not prices.get(TOKENS["SOL"]["mint"]):
        try:
            cg_resp = requests.get(
                "https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin,tether&vs_currencies=usd",
                timeout=5
            ).json()
            if "solana" in cg_resp:
                prices[TOKENS["SOL"]["mint"]] = float(cg_resp["solana"]["usd"])
            if "usd-coin" in cg_resp:
                prices[TOKENS["USDC"]["mint"]] = float(cg_resp["usd-coin"]["usd"])
            if "tether" in cg_resp:
                prices[TOKENS["USDT"]["mint"]] = float(cg_resp["tether"]["usd"])
        except Exception:
            pass

    # Ensure hardcoded fallback for USDC/USDT if still 0
    if TOKENS["USDC"]["mint"] not in prices:
        prices[TOKENS["USDC"]["mint"]] = 1.0
    if TOKENS["USDT"]["mint"] not in prices:
        prices[TOKENS["USDT"]["mint"]] = 1.0

    return prices


def make_rpc_request(session: requests.Session, rpc_url: str, method: str, params: list, max_retries: int = 3):
    """
    Sends a JSON-RPC request with retry & backoff on 429 rate limits or timeouts.
    """
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    for attempt in range(max_retries):
        try:
            resp = session.post(rpc_url, json=payload, timeout=12)
            if resp.status_code == 429:
                time.sleep((attempt + 1) * 1.5)
                continue
            data = resp.json()
            if "error" in data and "429" in str(data.get("error")):
                time.sleep((attempt + 1) * 1.5)
                continue
            return data
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(1.0)
    return None


class Command(BaseCommand):
    """
    Django Management Command to query Solana mainnet balances for all users.
    Generates a beautifully formatted Excel report and analytical charts 
    to evaluate the economic footprint of the social layer network.
    """
    help = 'Fetches wallet balances, generates an Excel report, and plots analytics.'

    def handle(self, *args, **options):
        console = Console()
        
        users_with_wallets = User.objects.filter(wallet_address__isnull=False).exclude(wallet_address="")
        total_users = users_with_wallets.count()
        users_with_wallets = list(User.objects.filter(wallet_address__isnull=False).exclude(wallet_address=""))
        total_users = len(users_with_wallets)
        
        console.print(Panel(
            f"Analyzing [bold cyan]NextVibe Social Layer[/bold cyan] network.\nFound [bold green]{total_users}[/bold green] linked wallets.", 
            title="NextVibe Analytics", 
            border_style="cyan"
        ))
        
        if total_users == 0:
            console.print("[yellow]No linked wallets found in database.[/yellow]")
            return

        # 1. Fetch current prices from Jupiter API v3
        console.print("[cyan]Fetching live token prices from Jupiter API...[/cyan]")
        mints = ",".join([t["mint"] for t in TOKENS.values()])
        prices = {}
        try:
            price_resp = requests.get(f"https://api.jup.ag/price/v3?ids={mints}", timeout=10).json()
            response_data = price_resp.get("data", price_resp) if isinstance(price_resp, dict) else price_resp
            for k, v in response_data.items():
                if isinstance(v, dict):
                    prices[k] = v.get("usdPrice", v.get("price", 0.0))
        except Exception as e:
            console.print(f"[bold red]Failed to fetch prices: {e}[/bold red]")
        # 1. Resolve RPC URL
        helius_key = (
            os.getenv("HELIUS_API_KEY") or
            getattr(settings, "HELIUS_API_KEY", "") or
            os.getenv("RPC_KEY", "")
        ).strip()

        rpc_url = os.getenv("RPC_KEY")
        rpc_url = f"https://mainnet.helius-rpc.com/?api-key={rpc_url}" if rpc_url else "https://api.mainnet-beta.solana.com"
        if helius_key:
            rpc_url = f"https://mainnet.helius-rpc.com/?api-key={helius_key}"
            delay_between_wallets = 0.08  # Fast & safe for Helius
            console.print(f"[green]✓ Using Helius RPC Provider[/green] (Key: {helius_key[:4]}...{helius_key[-4:]})")
        else:
            rpc_url = "https://api.mainnet-beta.solana.com"
            delay_between_wallets = 0.4   # Conservative delay for public endpoint
            console.print("[yellow]⚠️ No HELIUS_API_KEY found in .env! Using public Solana RPC (slower with rate limits).[/yellow]")

        # 2. Fetch current prices
        console.print("[cyan]Fetching live token prices...[/cyan]")
        prices = fetch_token_prices(console)

        # Show price summary
        price_table = Table(box=box.SIMPLE, show_header=True, header_style="bold magenta")
        price_table.add_column("Token", style="cyan")
        price_table.add_column("Price (USD)", justify="right", style="green")
        for sym, meta in list(TOKENS.items())[:6]:
            p = prices.get(meta["mint"], 0.0)
            price_table.add_row(sym, f"${p:,.4f}" if p < 1 else f"${p:,.2f}")
        console.print(price_table)

        # Session for connection reuse
        session = requests.Session()

        # Data structures for Excel and Analytics
        excel_data = []
        token_tvl = {symbol: 0.0 for symbol in TOKENS.keys()}
        
        # 2. Progress Bar for fetching data
        running_tvl = 0.0
        active_count = 0

        # 3. Progress Bar with Live Logs
        programs = [
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", # Standard SPL
            "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"  # Token-2022 (e.g., PYUSD)
        ]

        console.print("\n[bold cyan]Scanning wallets on Solana Mainnet...[/bold cyan]\n")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=40, style="magenta", complete_style="cyan"),
            BarColumn(bar_width=30, style="magenta", complete_style="cyan"),
            "[progress.percentage]{task.percentage:>3.0f}%",
            TextColumn("• {task.completed}/{task.total} wallets"),
            TimeRemainingColumn(),
            console=console
        ) as progress:
            
            task = progress.add_task("[cyan]Scanning blockchain...", total=total_users)
            task = progress.add_task("[cyan]Scanning...", total=total_users)
            
            for user in users_with_wallets:
                wallet = user.wallet_address
            for idx, user in enumerate(users_with_wallets, start=1):
                wallet = user.wallet_address.strip()
                user_record = {"Username": user.username, "Wallet Address": wallet}
                user_total_usd = 0.0
                
                # --- Fetch SOL Balance ---
                try:
                    sol_res = requests.post(rpc_url, json={"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [wallet]}, timeout=10).json()
                    sol_lamports = sol_res.get("result", {}).get("value", 0) if "error" not in sol_res else 0
                    sol_amount = sol_lamports / (10 ** TOKENS["SOL"]["decimals"]) if isinstance(sol_lamports, int) else 0
                except Exception:
                    sol_amount = 0
                sol_amount = 0.0
                sol_res = make_rpc_request(session, rpc_url, "getBalance", [wallet])
                if sol_res and "result" in sol_res:
                    lamports = sol_res["result"].get("value", 0)
                    if isinstance(lamports, (int, float)):
                        sol_amount = lamports / (10 ** TOKENS["SOL"]["decimals"])

                # --- Fetch SPL Balances (Checking Standard & Token-2022) ---
                # --- Fetch SPL Balances ---
                spl_balances = {}
                programs = [
                    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", # Standard SPL
                    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"  # Token-2022 (e.g., PYUSD)
                ]
                
                for prog_id in programs:
                    try:
                        spl_payload = {
                            "jsonrpc": "2.0", "id": 2,
                            "method": "getTokenAccountsByOwner",
                            "params": [wallet, {"programId": prog_id}, {"encoding": "jsonParsed"}]
                        }
                        spl_res = requests.post(rpc_url, json=spl_payload, timeout=10).json()
                        if "error" not in spl_res:
                            accounts = spl_res.get("result", {}).get("value", [])
                            if isinstance(accounts, list):
                                for acc in accounts:
                    spl_res = make_rpc_request(
                        session,
                        rpc_url,
                        "getTokenAccountsByOwner",
                        [wallet, {"programId": prog_id}, {"encoding": "jsonParsed"}]
                    )
                    if spl_res and "result" in spl_res:
                        accounts = spl_res["result"].get("value", [])
                        if isinstance(accounts, list):
                            for acc in accounts:
                                try:
                                    info = acc.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
                                    mint = info.get("mint")
                                    amount = info.get("tokenAmount", {}).get("uiAmount", 0)
                                    if mint and amount:
                                        spl_balances[mint] = spl_balances.get(mint, 0) + amount
                    except Exception:
                        pass
                
                # --- Compile User Data ---
                                    token_amount_obj = info.get("tokenAmount", {})
                                    amount = token_amount_obj.get("uiAmount") or 0.0
                                    if mint and amount > 0:
                                        spl_balances[mint] = spl_balances.get(mint, 0.0) + float(amount)
                                except Exception:
                                    pass

                # --- Compile User Data & Calculate Values ---
                held_tokens_log = []
                for symbol, meta in TOKENS.items():
                    mint = meta["mint"]
                    amount = sol_amount if symbol == "SOL" else spl_balances.get(mint, 0.0)
                    price = prices.get(mint, 0.0)
                    usd_val = amount * price
                    
                    user_record[f"{symbol} Amount"] = amount
                    user_record[f"{symbol} Value ($)"] = usd_val
                    
                    token_tvl[symbol] += usd_val
                    user_total_usd += usd_val
                    if amount > 0:
                        token_tvl[symbol] += usd_val
                        user_total_usd += usd_val
                        held_tokens_log.append(f"{amount:.3f} {symbol} (${usd_val:,.2f})")
                
                user_record["Total USD"] = user_total_usd
                excel_data.append(user_record)

                if user_total_usd > 0:
                    running_tvl += user_total_usd
                    active_count += 1
                    tokens_summary = ", ".join(held_tokens_log[:3])
                    console.log(
                        f"[bold green]💰 [#{idx}][/bold green] [cyan]{user.username}[/cyan] "
                        f"({wallet[:4]}...{wallet[-4]}): [bold green]${user_total_usd:,.2f}[/bold green] "
                        f"[dim]({tokens_summary})[/dim]"
                    )

                progress.update(
                    task,
                    advance=1,
                    description=f"[cyan]Scanning... (TVL: [bold green]${running_tvl:,.2f}[/bold green] | Active: {active_count})"
                )
                
                progress.advance(task)
                time.sleep(0.2) # Avoid RPC rate limits
                time.sleep(delay_between_wallets)

        # 3. Perform Deep Analytics
        # 4. Perform Deep Analytics
        df = pd.DataFrame(excel_data)
        
        total_network_tvl = df["Total USD"].sum()
        avg_wallet = df["Total USD"].mean()
        median_wallet = df["Total USD"].median()
        avg_wallet = df["Total USD"].mean() if total_users > 0 else 0
        median_wallet = df["Total USD"].median() if total_users > 0 else 0
        active_wallets = df[df["Total USD"] > 0].shape[0]
        
        # Sort to find whales
        whales_df = df.sort_values(by="Total USD", ascending=False).head(5)

        # 4. Console Analytics Output
        console.print("\n[bold cyan]=== NETWORK ANALYTICS ===[/bold cyan]")
        # 5. Console Analytics Output
        console.print("\n[bold cyan]=== NETWORK ANALYTICS REPORT ===[/bold cyan]")
        
        stats_table = Table(box=box.MINIMAL_DOUBLE_HEAD)
        stats_table.add_column("Metric", style="magenta")
        stats_table.add_column("Value", style="green", justify="right")
        
        stats_table.add_row("Total Network TVL", f"${total_network_tvl:,.2f}")
        stats_table.add_row("Active Wallets (> $0)", f"{active_wallets} / {total_users}")
        stats_table.add_row("Average Balance", f"${avg_wallet:,.2f}")
        stats_table.add_row("Median Balance", f"${median_wallet:,.2f}")
        console.print(stats_table)

        console.print("\n[bold yellow]🏆 Top 5 Network Whales:[/bold yellow]")
        for idx, row in whales_df.iterrows():
            console.print(f" 👤 [cyan]{row['Username']}[/cyan] ({row['Wallet Address'][:8]}...): [green]${row['Total USD']:,.2f}[/green]")
            if row['Total USD'] > 0:
                console.print(f" 👤 [cyan]{row['Username']}[/cyan] ({row['Wallet Address'][:6]}...{row['Wallet Address'][-4]}): [green]${row['Total USD']:,.2f}[/green]")
            else:
                console.print(f" 👤 [cyan]{row['Username']}[/cyan] ({row['Wallet Address'][:6]}...): [dim]$0.00[/dim]")

        # 5. Generate Beautiful Excel Report
        # 6. Generate Beautiful Excel Report
        excel_path = "nextvibe_wallets_report.xlsx"
        console.print(f"\n[cyan]Exporting rich data to Excel -> {excel_path}[/cyan]")
        
        writer = pd.ExcelWriter(excel_path, engine='xlsxwriter')
        df.to_excel(writer, sheet_name='Wallets', index=False)
        
        workbook = writer.book
        worksheet = writer.sheets['Wallets']
        
        # Excel Styling
        header_format = workbook.add_format({'bold': True, 'bg_color': '#0A0410', 'font_color': '#FFFFFF', 'border': 1})
        money_format = workbook.add_format({'num_format': '$#,##0.00'})
        num_format = workbook.add_format({'num_format': '#,##0.0000'})
        
        for col_num, value in enumerate(df.columns.values):
            worksheet.write(0, col_num, value, header_format)
        try:
            writer = pd.ExcelWriter(excel_path, engine='xlsxwriter')
            df.to_excel(writer, sheet_name='Wallets', index=False)
            
            # Auto-adjust column width based on column name length
            col_width = max(len(str(value)), 12)
            if "Value ($)" in value or "Total USD" in value:
                worksheet.set_column(col_num, col_num, col_width, money_format)
            elif "Amount" in value:
                worksheet.set_column(col_num, col_num, col_width, num_format)
            else:
                worksheet.set_column(col_num, col_num, 25) # Fixed width for usernames/wallets
                
        writer.close()
            workbook = writer.book
            worksheet = writer.sheets['Wallets']
            
            # Excel Styling
            header_format = workbook.add_format({'bold': True, 'bg_color': '#0A0410', 'font_color': '#FFFFFF', 'border': 1})
            money_format = workbook.add_format({'num_format': '$#,##0.00'})
            num_format = workbook.add_format({'num_format': '#,##0.0000'})
            
            for col_num, value in enumerate(df.columns.values):
                worksheet.write(0, col_num, value, header_format)
                col_width = max(len(str(value)), 12)
                if "Value ($)" in value or "Total USD" in value:
                    worksheet.set_column(col_num, col_num, col_width, money_format)
                elif "Amount" in value:
                    worksheet.set_column(col_num, col_num, col_width, num_format)
                else:
                    worksheet.set_column(col_num, col_num, 25)
                    
            writer.close()
            console.print("[green]✓ Excel report generated successfully[/green]")
        except Exception as e:
            console.print(f"[red]Failed to generate Excel report: {e}[/red]")

        # 6. Generate Analytics Charts (PNG)
        # 7. Generate Analytics Charts (PNG)
        console.print("[cyan]Generating analytics charts...[/cyan]")
        self.generate_charts(token_tvl, df)
        console.print("\n[bold green]✅ Task completed successfully![/bold green]")
        try:
            self.generate_charts(token_tvl, df)
            console.print("[green]✓ Charts saved to nextvibe_analytics_charts.png[/green]")
        except Exception as e:
            console.print(f"[red]Failed to generate charts: {e}[/red]")

        console.print("\n[bold green]✅ Scan completed successfully![/bold green]")


    def generate_charts(self, token_tvl, df):
        """
        Generates a PNG image containing analytics plots.
        Uses the preferred dark theme hex #0A0410.
        """
        # Filter out tokens with zero TVL
        active_tokens = {k: v for k, v in token_tvl.items() if v > 0}
        
        if not active_tokens:
            return # Nothing to plot
            return
            
        # Sort for the pie chart
        sorted_tokens = dict(sorted(active_tokens.items(), key=lambda item: item[1], reverse=True))
        labels = list(sorted_tokens.keys())
        sizes = list(sorted_tokens.values())

        # Setup Matplotlib style targeting the custom #0A0410 dark theme
        plt.style.use('dark_background')
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
        fig.patch.set_facecolor('#0A0410')
        ax1.set_facecolor('#0A0410')
        ax2.set_facecolor('#0A0410')

        # Custom colors for the charts
        theme_colors = ['#00FF9D', '#00B8FF', '#FF0055', '#FFB800', '#A200FF']
        theme_colors = ['#00FF9D', '#00B8FF', '#FF0055', '#FFB800', '#A200FF', '#00E5FF', '#E040FB']

        # Plot 1: Token Dominance (Pie Chart)
        wedges, texts, autotexts = ax1.pie(
            sizes, labels=labels, autopct='%1.1f%%', startangle=140, 
            colors=theme_colors, textprops={'color': "w", 'family': 'monospace'}
            colors=theme_colors[:len(labels)], textprops={'color': "w", 'family': 'monospace'}
        )
        ax1.set_title('Protocol Token Dominance (TVL)', color='white', family='monospace', fontsize=14, pad=20)
        
        for autotext in autotexts:
            autotext.set_color('black')
            autotext.set_weight('bold')

        # Plot 2: Wealth Distribution (Top 10 vs Rest)
        sorted_users = df.sort_values(by="Total USD", ascending=False)
        top_10_tvl = sorted_users.head(10)["Total USD"].sum()
        rest_tvl = sorted_users.iloc[10:]["Total USD"].sum()
        rest_tvl = sorted_users.iloc[10:]["Total USD"].sum() if len(sorted_users) > 10 else 0
        
        ax2.bar(["Top 10 Users", "All Other Users"], [top_10_tvl, rest_tvl], color=['#00FF9D', '#333333'])
        ax2.set_title('Wealth Distribution (USD)', color='white', family='monospace', fontsize=14, pad=20)
        ax2.tick_params(colors='white', labelsize=10)
        ax2.spines['top'].set_visible(False)
        ax2.spines['right'].set_visible(False)
        ax2.spines['left'].set_color('#333333')
        ax2.spines['bottom'].set_color('#333333')
        
        # Add value labels on bars
        for i, v in enumerate([top_10_tvl, rest_tvl]):
            ax2.text(i, v + (v*0.02), f'${v:,.0f}', color='white', ha='center', family='monospace', fontweight='bold')
            ax2.text(i, v + (v * 0.02 + 0.1), f'${v:,.0f}', color='white', ha='center', family='monospace', fontweight='bold')

        plt.tight_layout()
        plot_path = Path("nextvibe_analytics_charts.png")
        plt.savefig(plot_path, dpi=300, bbox_inches='tight', facecolor='#0A0410')
        plt.close()