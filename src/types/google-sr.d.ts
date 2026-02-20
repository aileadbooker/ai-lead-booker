declare module 'google-sr' {
    export interface SearchResult {
        type: string;
        title?: string;
        link?: string;
        description?: string;
        [key: string]: any;
    }

    export interface SearchOptions {
        query: string;
        safeMode?: boolean;
        page?: number;
    }

    export function search(options: SearchOptions): Promise<SearchResult[]>;
}
