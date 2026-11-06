import { Client, type Logger } from "@caido/sdk-client";
import { logger } from "@oh-my-pi/pi-utils";
import * as path from "node:path";

const INSTANCE_URL = "http://127.0.0.1:8080";
const PAT_FILE = path.resolve(import.meta.dir, "../../../caido.pat");

const sdkLogger: Logger = {
	debug(message) {
		logger.debug("Caido SDK", { message });
	},
	info(message) {
		logger.info("Caido SDK", { message });
	},
	warn(message) {
		logger.warn("Caido SDK", { message });
	},
	error(message) {
		logger.error("Caido SDK", { message });
	},
};

let connection: Promise<Client> | undefined;

export function connectCaido(): Promise<Client> {
	connection ??= (async () => {
		const pat = (await Bun.file(PAT_FILE).text()).trim();
		if (!pat) throw new Error(`Caido PAT file is empty: ${PAT_FILE}`);

		const client = new Client({ url: INSTANCE_URL, auth: { pat }, logger: sdkLogger });
		await client.connect();
		return client;
	})().catch(error => {
		connection = undefined;
		throw error;
	});
	return connection;
}
