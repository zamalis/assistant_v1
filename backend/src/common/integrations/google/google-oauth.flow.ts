import type { User } from '../../entities';
import type { GoogleCredentialRepository } from '../../repositories';
import { randomBytes } from 'node:crypto';

import { CodeChallengeMethod, type OAuth2Client } from 'google-auth-library';

import { encrypt } from '../../crypto';
import { ErrorMessage } from '../../enums';
import { InternalServerError } from '../../errors';

import { GOOGLE_API_SCOPES, GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPES } from './google-scopes';

export interface AuthRequest {
    url: string;
    state: string;
    codeVerifier: string;
}

export interface CompleteAuthInput {
    client: OAuth2Client;
    clientId: string;
    code: string;
    codeVerifier: string;
    user: User;
    encryptionKey: Buffer;
    repository: GoogleCredentialRepository;
}

export interface CompleteAuthResult {
    googleEmail: string;
    missingScopes: string[];
}

export async function buildAuthRequest(client: OAuth2Client): Promise<AuthRequest> {
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(32).toString('hex');
    const url = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [...GOOGLE_SCOPES],
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
    });

    return { url, state, codeVerifier: codeVerifier as string };
}

export async function completeAuth(input: CompleteAuthInput): Promise<CompleteAuthResult> {
    const { client, clientId, code, codeVerifier, user, encryptionKey, repository } = input;
    const { tokens } = await client.getToken({ code, codeVerifier });

    if (!tokens.refresh_token) {
        throw new InternalServerError(ErrorMessage.GOOGLE_NO_REFRESH_TOKEN);
    }

    const ticket = tokens.id_token
        ? await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId })
        : null;
    const googleEmail = ticket?.getPayload()?.email;

    if (!googleEmail) {
        throw new InternalServerError(ErrorMessage.GOOGLE_NO_EMAIL);
    }

    // Google reports `email` back as `userinfo.email`, so only the API scopes are compared.
    const granted = new Set((tokens.scope ?? '').split(' '));
    const grantedApiScopes = GOOGLE_API_SCOPES.filter((scope) => granted.has(scope));
    const missingScopes = GOOGLE_API_SCOPES.filter((scope) => !granted.has(scope));

    const fields = {
        userId: user.id,
        refreshToken: encrypt(tokens.refresh_token, encryptionKey),
        scopes: [...GOOGLE_IDENTITY_SCOPES, ...grantedApiScopes],
        googleEmail,
    };
    const existing = await repository.findOneBy({ userId: user.id });

    await repository.save(existing ? Object.assign(existing, fields) : repository.create(fields));

    return { googleEmail, missingScopes };
}
