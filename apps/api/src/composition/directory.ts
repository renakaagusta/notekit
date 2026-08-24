/**
 * Composition root for the public-key directory use case: binds it to the
 * Drizzle repository. The directory route imports the wired functions from here.
 */
import { directoryRepository } from "../adapters/driven/db/directoryRepository";
import { createDirectory } from "../application/usecases/directory";

const directory = createDirectory(directoryRepository);

export const publishDirectoryKeys = directory.publishKeys;
export const lookupDirectoryByEmail = directory.lookupByEmail;
