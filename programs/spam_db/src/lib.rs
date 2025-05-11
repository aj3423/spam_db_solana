#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;


declare_id!("SpamUf6NdJBSnZUjqicPv38cc21R6ZLtkKU9sR5uJid");

const DAYS_TO_KEEP: u64 = 60;
const SECONDS_PER_DAY: u64 = 86_400;

// each number is 20 bytes, it can hold 50,000 numbers every day
const MAX_NUM: usize = 20_000; 
type StrChunk = [u8; 20];

fn now() -> u64 {
    Clock::get().unwrap().unix_timestamp as u64
}

// It returns the index of the current day, in the range of 0~59
// When it reaches 60, it will return 0 again.
// fn index_of_today() -> u64 {
//     let now_ = now();
//     msg!("now_: {:?}", now_);
//     (now_ / SECONDS_PER_DAY) % DAYS_TO_KEEP
// }

#[program]
pub mod spam_db {
    use super::*;

    // Initialize a daily PDA + a large accout.
    // Only create 60 pairs of them, one for each day.
    // Creating such large accounts is expensive, they will be re-used 
    //   after 60 days to avoid creating new account every day.
    //
    // We use an account instead of PDA because it's impossible to create a large PDA(> 1M).
    // Although PDA can grow to 10MB, it'll be very expensive to access or expand.
    // Here we use `zero_copy` for these large accounts.
    pub fn init_daily_acc(
        ctx: Context<InitDailyAcc>, 
    ) -> Result<()> {
        let data = &mut ctx.accounts.data_acc.load_init()?;

        data.numbers = [StrChunk::default(); MAX_NUM];
        
        data.last_update = 0;
        data.count = 0;

        Ok(())
    }

    // After creating a daily large account in the previous step,
    //   create a PDA to store the account address.
    // The PDA's address can be computed by the `cc` and `day_index`.
    pub fn init_daily_pda(
        ctx: Context<InitDailyPDA>, 
        _cc: String,
        _day_index: u64,
        data_acc: Pubkey,
    ) -> Result<()> {
        ctx.accounts.daily_pda.data_acc = data_acc;
        Ok(())
    }

    pub fn report_number<'life>(
        ctx: Context<'_,'_,'life, 'life, ReportNumber<'life>>,
        _cc: String,
        domestic: String,
        category: i8,
    ) -> Result<()> {
        let now_ = now();

        // Update number pda
        let number_pda = &mut ctx.accounts.number_pda;
        
        let last_number_report_time = number_pda.last_reported; // save it for later use
        {
            // Reset the number PDA if the `last_reported` is older than 60 days
            if now_ - number_pda.last_reported > SECONDS_PER_DAY * DAYS_TO_KEEP {
                msg!("number PDA is too old, resetting");
                number_pda.reset_counter();
            }

            // Update the number PDA
            number_pda.increase_counter(category);
            number_pda.last_reported = now_;
        }

        // Update daily pda
        {
            let mut daily_data = ctx.accounts.daily_data_acc.load_mut()?;

            // TODO: verify if `daily_acc` matches today's `pda.data_acc`

            // If it hasn't been used wthin 60 days, clear it first.
            // Check with `10 days` here, it can be any duration between 1~59 days.
            if now_ - daily_data.last_update > SECONDS_PER_DAY * 10 {
                daily_data.count = 0;
            }

            // TODO: remove this check, when it's full, rollback and override the first number, 
            // to support reporting infinit numbers. (previous ones will be lost)
            if daily_data.count >= MAX_NUM as u64 {
                msg!("Daily numbers are full, skipping this number");
                return Err(ErrorCode::NumberIsFull.into());
            }

            // Avoid repeatedly adding a number to the daily numbers vector, 
            //   only add if last_report_time < today's 00:00, which means this number
            //   has not been reported today. 
            msg!("last_number_report_time: {}, (...): {}", last_number_report_time, (now_ - now_ % SECONDS_PER_DAY));
            if last_number_report_time < (now_ - now_ % SECONDS_PER_DAY) {
                let n = daily_data.count as usize;

                let mut first20 = domestic.clone();
                first20.truncate(20);

                let mut chunk = [0; 20];
                chunk[..first20.len()].copy_from_slice(first20.as_bytes());

                daily_data.numbers[n]
                    .copy_from_slice(&chunk);

                daily_data.count += 1;
            }
            daily_data.last_update = now_;
        }

        Ok(())
    }

    pub fn query_number(ctx: Context<QueryNumber>, _cc: String, _domestic: String) -> Result<Option<NumberStats>> {
        let number_pda = &mut ctx.accounts.number_pda;

        // if it hasn't been updated over 60 days, ignore previous scores, return None.
        if number_pda.last_reported + SECONDS_PER_DAY * DAYS_TO_KEEP < now() {
            msg!("number PDA is too old, returning None");
            return Ok(None);
        }

        Ok(Some((**number_pda).clone()))
    }
}

#[derive(Accounts)]
pub struct InitDailyAcc <'life> {
    #[account(zero)]
    pub data_acc: AccountLoader<'life, DailyData>,
}


#[derive(Accounts)]
#[instruction(cc: String, day_index: u64)]
pub struct InitDailyPDA <'life> {
    #[account(
        init_if_needed, 
        payer = signer,
        space = 8 + 32, 
        seeds = [b"spam_db", cc.as_bytes(), &day_index.to_le_bytes()], 
        bump
    )]
    pub daily_pda: Account<'life, DailyPDA>,

    #[account(mut)]
    pub signer: Signer<'life>,
    pub system_program: Program<'life, System>,
}

#[derive(Accounts)]
#[instruction(cc: String, domestic: String)]
pub struct ReportNumber<'life> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 8 * 7, // u64 * 7 fields
        seeds = [b"spam_db", cc.as_bytes(), domestic.as_bytes()],
        bump
    )]
    pub number_pda: Account<'life, NumberStats>,

    #[account(mut)]
    pub daily_data_acc: AccountLoader<'life, DailyData>,

    #[account(mut)]
    pub user: Signer<'life>,
    pub system_program: Program<'life, System>,
}

#[derive(Accounts)]
#[instruction(cc: String, domestic: String)]
pub struct QueryNumber<'life> {
    #[account(
        seeds = [b"spam_db", cc.as_bytes(), domestic.as_bytes()],
        bump
    )]
    pub number_pda: Account<'life, NumberStats>,
    pub signer: Signer<'life>,
    pub system_program: Program<'life, System>,
}


#[account(zero_copy)]
pub struct DailyData {
    pub last_update: u64, // last update time
    pub count: u64, // the current count of numbers reported today
    pub numbers: [StrChunk; MAX_NUM], // list of numbers reported today
}

// It holds a pointer to the actual DailyData
// A PDA can't store large data, so we use a pointer to a separate account
#[account]
#[derive(Default)]
pub struct DailyPDA {
    pub data_acc: Pubkey,
}

#[account]
#[derive(Default)]
pub struct NumberStats {
    pub last_reported: u64, // last update time
                          
    pub valid: u64, // times of this number was reported as a "valid number"
    pub fraud: u64, // times of this number was reported as "fraud"
    pub marketing: u64, // times of this number was reported as "marketing"
    pub survey: u64, // times of this number was reported as "survey"
    pub political: u64, // times of this number was reported as "political"
    pub other_spam: u64, // times of this number was reported as "other spam"
}
impl NumberStats {
    pub fn reset_counter(&mut self) {
        self.valid = 0;
        self.fraud = 0;
        self.marketing = 0;
        self.survey = 0;
        self.political = 0;
        self.other_spam = 0;
    }
    pub fn increase_counter(&mut self, category: i8) {
        match category {
            0 => {
                // Disable marking as valid to prevent abuse by spammers,
                //   because they would mark their numbers as valid.
                self.valid += 1;
            },
            1 => self.fraud += 1,
            2 => self.marketing += 1,
            3 => self.survey += 1,
            4 => self.political += 1,
            _ => self.other_spam += 1,
        }
    }
}


#[error_code]
pub enum ErrorCode {
    #[msg("Lookup table doesn't contain today's PDA")]
    WrongLookupTableAddresses,

    #[msg("Daily numbers is full, cannot add more numbers")]
    NumberIsFull,

    #[msg("Account size exceeds the limit 10MB")]
    AccountSizeLimitExceeded,
}


