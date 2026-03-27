declare module 'intuit-oauth' {
  interface OAuthClientOptions {
    clientId: string
    clientSecret: string
    environment: 'sandbox' | 'production'
    redirectUri: string
  }

  interface TokenResponse {
    access_token: string
    refresh_token: string
    expires_in: number
    realmId: string
    token_type: string
  }

  interface AuthResponse {
    getJson(): TokenResponse
  }

  class OAuthClient {
    static scopes: {
      Accounting: string
      Payment: string
    }

    constructor(options: OAuthClientOptions)

    authorizeUri(params: { scope: string[]; state?: string }): string
    createToken(url: string): Promise<AuthResponse>
    refresh(): Promise<AuthResponse>
    setToken(token: { refresh_token: string }): void
  }

  export = OAuthClient
}
