import { getStoredAuth } from "./authStorage";

const API_BASE_URL = import.meta.env.VITE_BE_API_URL ?? "http://localhost:8000/api";

export class ApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

export type RequestJsonOptions = RequestInit & {
    /** When true, do not attach stored Bearer token (e.g. wallet login). */
    skipAuth?: boolean;
};

function mergeAuthHeaders(initHeaders: HeadersInit | undefined, skipAuth: boolean | undefined) {
    const headers = new Headers(initHeaders);
    if (!skipAuth) {
        const auth = getStoredAuth();
        if (auth?.accessToken && !headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${auth.accessToken}`);
        }
    }
    return headers;
}

export async function requestJson<T>(path: string, init?: RequestJsonOptions): Promise<T> {
    const { skipAuth, ...rest } = init ?? {};
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...rest,
        headers: mergeAuthHeaders(rest.headers, skipAuth),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const serverMessage =
            (errorBody as { message?: string } | null)?.message ??
            `Server error ${response.status}`;
        throw new ApiError(serverMessage, response.status);
    }

    return (await response.json()) as T;
}

export function mapApiErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof ApiError) {
        return error.message;
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallbackMessage;
}
