import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";

import * as idl from "../target/idl/spam_db.json";
import type { SpamDb } from "../target/types/spam_db";

import { expect } from "chai";
import { Transaction, SystemProgram, Keypair, PublicKey } from "@solana/web3.js";

const DAYS_TO_KEEP = 60;
const SECONDS_PER_DAY = 86400;

function deriveNumberPda(programId: PublicKey, cc: string, domestic: string) {
	const [pda, _] = PublicKey.findProgramAddressSync(
		[
			Buffer.from("spam_db"),
			Buffer.from(cc),
			Buffer.from(domestic),
		],
		programId
	);
	return pda;
}

function deriveDailyPda(programId: PublicKey, cc: string, dayIndex: number) {
	const [pda, _] = PublicKey.findProgramAddressSync(
		[
			Buffer.from("spam_db"),
			Buffer.from(cc),
			new BN(dayIndex).toArrayLike(Buffer, "le", 8),
		],
		programId
	);
	return pda;
}

function generateRandomNumber(length: number): string {
	// return "12345666"; 
	let result = '';
	for (let i = 0; i < length; i++) {
		result += Math.floor(Math.random() * 10);
	}
	return result;
}

// offset == -1 for yesterday, 0 for today, 1 for tomorrow, etc...
function getDayIndex(offset: number = 0) {
	const dayIndex = Math.floor(
		Date.now() / 1000 / SECONDS_PER_DAY
	) % DAYS_TO_KEEP;

	return (dayIndex + offset + DAYS_TO_KEEP) % DAYS_TO_KEEP;
}

// function allDailyPDAs(programId: PublicKey, cc: string) {
// 	let pdas = [];
// 	for (let dayIndex = 0; dayIndex < DAYS_TO_KEEP; dayIndex++) {
// 		pdas.push(deriveDailyPda(programId, cc, dayIndex));
// 	}

// 	return pdas;
// }
describe("spam_db", () => {
	console.clear();

	const provider = anchor.AnchorProvider.local();
	anchor.setProvider(provider);
	const connection = provider.connection;
	// const program = anchor.workspace.SpamDb as Program<SpamDb>;
	const program = new anchor.Program(idl as unknown as SpamDb, provider);
	const wallet = provider.wallet as anchor.Wallet;
	console.log("program id", program.programId.toBase58());


	const user1 = Keypair.fromSecretKey(Uint8Array.from([37, 70, 28, 64, 227, 17, 245, 163, 77, 212, 17, 122, 66, 191, 121, 17, 240, 120, 126, 141, 180, 97, 152, 163, 0, 25, 136, 184, 19, 98, 126, 239, 7, 35, 59, 192, 136, 237, 254, 24, 235, 188, 71, 209, 22, 182, 138, 249, 185, 1, 45, 212, 70, 96, 55, 64, 6, 232, 5, 193, 207, 145, 21, 6]));
	console.log("User1: ", user1.publicKey.toBase58());

	it("Airdrop ", async () => {
		await connection.requestAirdrop(user1.publicKey, 1e9);
	});

	const cc = "1";
	const domestic = generateRandomNumber(10);
	// console.log("Domestic number: ", domestic);

	const category = 1; // Fraud

	const numberPda = deriveNumberPda(program.programId, cc, domestic);
	// console.log("Number pda: ", numberPda.toBase58());


	// ---- admin functions ----

	// Create 60 PDAs for each day, initialize their `space` limit to 1k
	it("Init daily PDAs", async () => {

		// 20k numbers * 20 bytes each == 400k
		//   + discriminator(8) + last_updats(8) + count(8)
		const space = 400_000 + 8 + 8 + 8;
		const lamports =
			await connection.getMinimumBalanceForRentExemption(
				space,
			);

		const promises = [];

		for (let i = 0; i < DAYS_TO_KEEP; i++) {

			// 1. Create a large Acc for storing daily numbers
			const dailyAcc = Keypair.generate();
			// console.log("dailyAcc", dailyAcc.publicKey.toBase58());

			const createAcc = SystemProgram.createAccount({
				fromPubkey: program.provider.publicKey,
				newAccountPubkey: dailyAcc.publicKey,
				space,
				lamports,
				programId: program.programId,
			});
			const initAcc = await program.methods
				.initDailyAcc()
				.accounts({
					dataAcc: dailyAcc.publicKey,
				})
				.instruction();

			// 2. Store the Acc to corresponding PDA
			const storeAccInPda = await program.methods
				.initDailyPda(cc, new BN(i), dailyAcc.publicKey)
				.accounts({})
				.signers([wallet.payer])
				.instruction();

			const transaction = new anchor.web3.Transaction().add(
				createAcc,
				initAcc,
				storeAccInPda,
			);
			promises.push(
				provider.sendAndConfirm(transaction, [
					dailyAcc,
				])
			);
		}
		await Promise.all(promises);
	});


	// let lookupTableAddress: PublicKey;
	// it("Create lookup table", async () => {
	// 	const slot = await connection.getSlot("finalized");

	// 	let ix: TransactionInstruction;
	// 	[ix, lookupTableAddress] =
	// 		AddressLookupTableProgram.createLookupTable({
	// 			authority: wallet.publicKey,
	// 			payer: wallet.publicKey,
	// 			recentSlot: slot,
	// 		});

	// 	await sendV0Tx(connection, [ix], wallet.payer);
	// 	console.log("lookup table address:", lookupTableAddress.toBase58());
	// });

	// it("Wait for the lookup table to be active", async () => {
	// 	await waitForNewBlock(connection, 1);
	// });

	// it("Add all daily PDA addresses to the lookup table", async () => {
	// 	let addresses = allDailyPDAs(program.programId, cc);

	// 	const promises = [];

	// 	// Extend 30 addresses at a time, due to transaction size limits
	// 	while (addresses.length > 0) {
	// 		const chunk = addresses.slice(0, 30);
	// 		addresses = addresses.slice(30);

	// 		const ix = AddressLookupTableProgram.extendLookupTable({
	// 			addresses: chunk,
	// 			authority: wallet.publicKey,
	// 			lookupTable: lookupTableAddress,
	// 			payer: wallet.publicKey,
	// 		});

	// 		promises.push(sendV0Tx(connection, [ix], wallet.payer));
	// 	}
	// 	await Promise.all(promises);
	// });

	// // TODO: Save the lookup table address in the program state


	// it("Wait for the lookup table to be extended", async () => {
	// 	await waitForNewBlock(connection, 1);
	// });

	// ---- user functions ----

	it("Report a number", async () => {

		const dayIndex = getDayIndex();
		const pdaToday = deriveDailyPda(program.programId, cc, dayIndex);
		const pda = await program.account.dailyPda.fetch(pdaToday);

		// console.log("pda.dataAcc", pda.dataAcc.toBase58());

		const transaction = new anchor.web3.Transaction().add(
			await program.methods
				.reportNumber(cc, domestic, category)
				.accounts({
					dailyDataAcc: pda.dataAcc,
				})
				.signers([user1])
				.instruction()
		);
		await provider.sendAndConfirm(transaction);


		// verify NumberPDA
		{
			const numberPda_after = await program.account.numberStats.fetch(numberPda);
			expect(numberPda_after.fraud.toNumber(), "fraud count +1").to.be.greaterThan(0);
			expect(numberPda_after.lastReported.toNumber(), "lastReported time updated").to.be.greaterThan(0);
		}

		// verify dailyPDA
		{
			const dayIndex = getDayIndex();
			const pdaToday = deriveDailyPda(program.programId, cc, dayIndex);
			const pda = await program.account.dailyPda.fetch(pdaToday);
			const data = await program.account.dailyData.fetch(pda.dataAcc);
			const len = data.count.toNumber();

			const arr = data.numbers.slice(0, len).map((innerArray) =>
				innerArray
					.filter((num) => num !== 0)
					.map((num) => String.fromCharCode(num))
					.join("")
			).filter(s => s.length > 0);

			expect(arr.includes(domestic), "reported number is included in numbers[]").to.be.equal(true);
			expect(data.lastUpdate.toNumber(), "lastUpdate time updated").to.be.greaterThan(0);
		}
	});


	it("Query number", async () => {
		const stats = await program.methods
			.queryNumber(cc, domestic)
			.accounts({
				numberPda: numberPda,
				signer: user1.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.view();

		console.log("Query result", stats);
		expect(stats.lastReported.toNumber()).to.be.greaterThan(0);
		expect(stats.fraud.toNumber()).to.be.greaterThan(0);
	});

	describe("Download numbers", () => {
		const last5Days = 5;
		const numberCount = 10;

		it(`Simulate reporting ${numberCount} numbers in the last 5 days`, async () => {
			const promises = [];
			for (let i = 0; i < numberCount; i++) {
				const domestic = generateRandomNumber(10);

				const dayIndex = getDayIndex(-1 * Math.floor(Math.random() * last5Days));
				const pdaOfDay = deriveDailyPda(program.programId, cc, dayIndex);
				const pda = await program.account.dailyPda.fetch(pdaOfDay);

				const transaction = new Transaction().add(
					await program.methods
						.reportNumber(cc, domestic, category)
						.accounts({
							dailyDataAcc: pda.dataAcc,
						})
						.signers([user1])
						.instruction()
				);

				promises.push(
					provider.sendAndConfirm(transaction)
				);
			}
			await Promise.all(promises);
		});

		it("Download numbers of last 5 days ", async () => {
			const numbers = new Set<string>();
			for (let offset of [-4, -3, -2, -1, 0]) {
				const dayIndex = getDayIndex(offset);
				const pdaToday = deriveDailyPda(program.programId, cc, dayIndex);
				const pda = await program.account.dailyPda.fetch(pdaToday);

				const data = await program.account.dailyData.fetch(pda.dataAcc);
				const len = data.count.toNumber();

				const arr = data.numbers.slice(0, len).map((innerArray) =>
					innerArray
						.filter((num) => num !== 0)
						.map((num) => String.fromCharCode(num))
						.join("")
				).filter(s => s.length > 0);

				arr.forEach((num) => {
					numbers.add(num);
				});
			};

			console.log("Downloaded numbers:", numbers);
			expect(numbers.size, "number count not match").to.be.equal(numberCount + 1);
		});
	});
});
