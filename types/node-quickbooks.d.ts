declare module 'node-quickbooks' {
  interface AccountRef {
    value: string
    name?: string
  }

  interface JournalEntryLineDetail {
    PostingType: string
    AccountRef: AccountRef
  }

  interface JournalLine {
    Id?: string
    Amount: number
    DetailType: 'JournalEntryLineDetail'
    Description?: string
    JournalEntryLineDetail: JournalEntryLineDetail
  }

  interface JournalEntryInput {
    TxnDate?: string
    PrivateNote?: string
    Line: JournalLine[]
  }

  interface JournalEntry {
    Id: string
  }

  interface PaymentLine {
    Amount: number
    LinkedTxn: Array<{ TxnId: string; TxnType: string }>
  }

  interface PaymentInput {
    TxnDate?: string
    CustomerRef: { value: string }
    TotalAmt: number
    PrivateNote?: string
    Line: PaymentLine[]
  }

  interface Payment {
    Id: string
  }

  interface QueryResponse<T> {
    QueryResponse: {
      [key: string]: T[] | undefined
    }
  }

  type Callback<T> = (err: unknown, result: T) => void

  class QuickBooks {
    constructor(
      clientId: string,
      clientSecret: string,
      accessToken: string,
      oauthTokenSecret: boolean | null,
      realmId: string,
      sandbox: boolean,
      debug: boolean,
      minorVersion: null,
      oauthVersion: string,
      refreshToken: null
    )

    createJournalEntry(entry: JournalEntryInput, callback: Callback<JournalEntry>): void
    createPayment(payment: PaymentInput, callback: Callback<Payment>): void
    findInvoices(
      criteria: Array<{ field: string; value: string }>,
      callback: Callback<QueryResponse<unknown>>
    ): void
  }

  export = QuickBooks
}
