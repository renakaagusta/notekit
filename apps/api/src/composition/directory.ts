/**
 * Composition root for the public-key directory use case: binds the directory
 * use case to the Drizzle repository. Routes import the wired functions from here.
 */
import { directoryRepository } from "../adapters/driven/db/directoryRepository";
import { createDirectory } from "../application/usecases/directory";

const directory = createDirectory(directoryRepository);

export const publishDirectoryKeys = directory.publishKeys;
export const lookupDirectoryByEmail = directory.lookupByEmail;
