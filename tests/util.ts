import { Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, TransactionSignature } from '@solana/web3.js';

export async function sendV0Tx(
	connection: Connection,
	instructions: TransactionInstruction[],
	payer: Keypair,
) {
	let latestBlockhash = await connection.getLatestBlockhash('finalized');

	const messageV0 = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: latestBlockhash.blockhash,
		instructions: instructions
	}).compileToV0Message();

	const tx = new VersionedTransaction(messageV0);

	tx.sign([payer]);

	const txid = await connection.sendTransaction(tx);

	await connection.confirmTransaction({
		blockhash: latestBlockhash.blockhash,
		lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		signature: txid,
	});

	// console.log('v0 txid', explorerUrl(txid));
}

export async function sendV0TxWithLookupTable(
	connection: Connection,
	txInstructions: TransactionInstruction[],
	payer: Keypair,
	lookupTablePubkey: PublicKey,
) {
	const lookupTableAccount = await connection
		.getAddressLookupTable(lookupTablePubkey)
		.then((res) => res.value);

	// Validate lookup table account
	if (!lookupTableAccount) {
		throw new Error(`Lookup table ${lookupTablePubkey.toBase58()} not found or inactive`);
	}

	let blockhash = await connection.getLatestBlockhash('finalized');

	const messageV0 = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: blockhash.blockhash,
		instructions: txInstructions
	}).compileToV0Message([lookupTableAccount]);

	const tx = new VersionedTransaction(messageV0);

	tx.sign([payer]);

	const txid = await connection.sendTransaction(tx);

	await connection.confirmTransaction({
		blockhash: blockhash.blockhash,
		lastValidBlockHeight: blockhash.lastValidBlockHeight,
		signature: txid,
	});

	// console.log('v0 txid[table]: ', explorerUrl(txid));
}

export async function waitForNewBlock(
	connection: Connection,
	targetHeight: number,
): Promise<void> {

	const { lastValidBlockHeight: initialBlockHeight } =
		await connection.getLatestBlockhash();

	return new Promise((resolve) => {
		const SECOND = 1000;
		const checkInterval = 1 * SECOND; // Interval to check for new blocks (1000ms)

		const intervalId = setInterval(async () => {
			try {
				const { lastValidBlockHeight: currentBlockHeight } =
					await connection.getLatestBlockhash();

				if (currentBlockHeight >= initialBlockHeight + targetHeight) {
					clearInterval(intervalId);
					resolve();
				}
			} catch (error) {
				clearInterval(intervalId);
				resolve();
			}
		}, checkInterval);
	});
}

function explorerUrl(
	txid: TransactionSignature,
): string {
	return `https://explorer.solana.com/tx/${txid}?cluster=custom&customUrl=http://localhost:8899`;
}
