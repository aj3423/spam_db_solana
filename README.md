A spam phone number database on solana blockchain, for app [SpamBlocker](https://github.com/aj3423/SpamBlocker)

# Features
- Instant query
  - Query a number on the fly.
- Offline check
  - Download numbers reported in the last N days to the local database. (1<= N <= 60)
- Reporting
  - Report a number as spam with category.
- Privacy
  - No account required, no email registration. Just generate a wallet locally.

# Why solana
  - **Ethereum**
    - only ~15 TPS(transaction per second), too low for reporting numbers
  - **Solana**
    - current solution, 400~65000 TPS
  - **Sui**
    - yet to learn
  - **IPFS**
    - too slow for instant query

# Cost
  - Use testnet instead of mainnet to avoid transaction fee...
  - Schedule a daily workflow to airdrop 1 SOL when the balance < 1 SOL. 

# TODO
- Support SHA1, store/query a number's SHA1 hash instead of the plain number. 

# Screenshot
![image](https://github.com/user-attachments/assets/4a960d16-eb1c-47c4-878e-9967afbd6502)
