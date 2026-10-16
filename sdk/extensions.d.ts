// Generated from Nexlet/src/shared/plugin-api.ts.
/** Public extension contract. No dependency on the host renderer API. */
declare const SDK_PERMISSIONS: readonly ["files", "process", "backend", "browser", "screen", "input.simulate", "windows", "notifications", "ai", "services", "tools", "mcp", "media", "runtime.compute"];
export type SdkPermission = typeof SDK_PERMISSIONS[number];
export type SdkJson = null | boolean | number | string | SdkJson[] | {
    [key: string]: SdkJson;
};
export interface TaskOptions {
    id: string;
    timeoutMs?: number;
}
export interface SdkDocument {
    id: string;
    rev: string;
    value: SdkJson;
}
export interface SdkDocumentWrite {
    id: string;
    rev?: string;
    value: SdkJson;
}
export interface Schedule {
    id: string;
    method: string;
    args?: SdkJson;
    at: number;
    intervalMs?: number;
    lastRun?: number;
    lastError?: string;
}
export interface BackendContext {
    signal: AbortSignal;
    emit(value: unknown): void;
    dataDirectory: string;
}
/** Export an object named handlers from backend.cjs. Backend runs with full local Node privileges. */
export type BackendHandlers = Record<string, (args: unknown, context: BackendContext) => unknown | Promise<unknown>>;
export interface PluginSdkExtensions {
    /** Application UI language; system.info().locale remains the OS locale. */
    i18n: {
        getLocale(): Promise<'zh-CN' | 'zh-Hant' | 'en'>;
        onChange(callback: (locale: 'zh-CN' | 'zh-Hant' | 'en') => void): () => void;
    };
    window: {
        info(window?: string): Promise<{
            bounds: SdkRect;
            visible: boolean;
            focused: boolean;
            alwaysOnTop: boolean;
            fullScreen: boolean;
        }>;
        show(window?: string): Promise<true>;
        hide(window?: string): Promise<true>;
        focus(window?: string): Promise<true>;
        close(window?: string): Promise<true>;
        detach(): Promise<true>;
        set(options: {
            bounds?: Partial<SdkRect>;
            alwaysOnTop?: boolean;
            fullScreen?: boolean;
            resizable?: boolean;
            opacity?: number;
            title?: string;
        }, window?: string): Promise<true>;
        create(options: {
            entry: string;
            title?: string;
            width?: number;
            height?: number;
            visible?: boolean;
        }): Promise<string>;
        /** Omit window to send to the parent; only child windows have a parent. */
        send(message: SdkJson, window?: string): Promise<true>;
        onMessage(callback: (event: {
            from: string | null;
            message: SdkJson;
        }) => void): () => void;
        onClosed(callback: (event: {
            window: string;
        }) => void): () => void;
    };
    commands: {
        list(): Promise<SdkFeature[]>;
        set(features: SdkFeature[]): Promise<true>;
        /** Accepted for asynchronous launch; errors are shown by the host. */
        redirect(options: {
            pluginId: string;
            code: string;
            payload?: string;
        }): Promise<true>;
    };
    search: {
        returnToLauncher(text: string): Promise<true>;
        set(options: {
            text?: string;
            placeholder?: string;
            visible?: boolean;
        }): Promise<true>;
        results(results: {
            id: string;
            title: string;
            description?: string;
        }[]): Promise<true>;
        onChange(callback: (event: {
            text: string;
        }) => void): () => void;
        onSelect(callback: (event: {
            id: string;
        }) => void): () => void;
    };
    browser: {
        create(options?: {
            visible?: boolean;
            width?: number;
            height?: number;
        }): Promise<string>;
        perform<A extends BrowserAction>(options: TaskOptions & {
            browser: string;
            action: A;
        }): Promise<BrowserResult<A>>;
        close(browser: string): Promise<true>;
        onClosed(callback: (event: {
            browser: string;
        }) => void): () => void;
        onDownload(callback: (event: {
            browser: string;
            received: number;
            total: number;
        }) => void): () => void;
    };
    media: {
        image<M extends boolean = false>(options: TaskOptions & {
            data: Uint8Array;
            metadata?: M;
            operations?: {
                op: ImageOperation;
                args?: unknown[];
            }[];
            format?: 'png' | 'jpeg' | 'webp' | 'avif' | 'tiff' | 'gif';
        }): Promise<M extends true ? ImageMetadata : ImageResult>;
        ffmpeg(options: TaskOptions & {
            args: string[];
            cwd?: string;
            executable?: string;
        }): Promise<{
            code: number;
            stdout: string;
            stderr: string;
        }>;
    };
    ai: {
        configure(config: ProviderConfig | null): Promise<{
            configured: boolean;
            persistent: boolean;
        }>;
        status(): Promise<ProviderStatus>;
        models(options: TaskOptions): Promise<{
            id: string;
            [key: string]: unknown;
        }[]>;
        chat<S extends boolean = false>(options: TaskOptions & {
            request: ChatRequest;
            stream?: S;
        }): Promise<S extends true ? ChatStreamResult : ChatCompletion>;
        onChunk(callback: (event: {
            id: string;
            chunk: Record<string, unknown>;
        }) => void): () => void;
    };
    services: {
        configure(config: ProviderConfig | null): Promise<{
            configured: boolean;
            persistent: boolean;
        }>;
        status(): Promise<ProviderStatus>;
        account(options: TaskOptions): Promise<{
            user: {
                id: string;
                [key: string]: unknown;
            } | null;
        }>;
        login(options: TaskOptions): Promise<{
            url: string;
            sessionId: string;
        }>;
        loginStatus(options: TaskOptions & {
            sessionId: string;
        }): Promise<{
            status: 'pending' | 'complete' | 'expired';
            persistent?: boolean;
        }>;
        license(options: TaskOptions & {
            product: string;
        }): Promise<{
            active: boolean;
            [key: string]: unknown;
        }>;
        checkout(options: TaskOptions & {
            product: string;
            idempotencyKey: string;
        }): Promise<{
            url: string;
            [key: string]: unknown;
        }>;
        syncGet(options: TaskOptions & {
            key: string;
        }): Promise<{
            value: SdkJson;
            version: string | null;
        }>;
        syncPut(options: TaskOptions & {
            key: string;
            expectedVersion: string | null;
            value: SdkJson;
            idempotencyKey: string;
        }): Promise<{
            version: string;
        }>;
    };
    tools: {
        register(definition: SdkToolDefinition): Promise<true>;
        list(): Promise<Omit<SdkToolDefinition, 'method'>[]>;
        remove(name: string): Promise<boolean>;
        call(options: TaskOptions & {
            name: string;
            args?: SdkJson;
        }): Promise<unknown>;
    };
    mcp: {
        start(): Promise<{
            url: string;
            token: string;
        }>;
        stop(): Promise<true>;
    };
    system: {
        info(): Promise<{
            platform: string;
            arch: string;
            release: string;
            version: string;
            electron: string;
            locale: string;
            dark: boolean;
            packaged: boolean;
        }>;
        path(name: 'home' | 'appData' | 'userData' | 'temp' | 'exe' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'logs'): Promise<string>;
        fileIcon(path: string): Promise<string>;
        openPath(path: string): Promise<true>;
        reveal(path: string): Promise<true>;
        trash(path: string): Promise<true>;
    };
    files: {
        read(path: string): Promise<Uint8Array>;
        write(path: string, data: Uint8Array, overwrite?: boolean): Promise<true>;
        stat(path: string): Promise<{
            size: number;
            directory: boolean;
            modifiedAt: number;
            createdAt: number;
        }>;
        list(path: string): Promise<{
            name: string;
            directory: boolean;
            symbolicLink: boolean;
        }[]>;
        mkdir(path: string, recursive?: boolean): Promise<true>;
        rename(path: string, to: string): Promise<true>;
        copy(path: string, to: string, overwrite?: boolean): Promise<true>;
        remove(path: string): Promise<true>;
    };
    process: {
        run(request: TaskOptions & {
            executable: string;
            args?: string[];
            cwd?: string;
            env?: Record<string, string>;
            stdin?: string;
        }): Promise<{
            code: number;
            stdout: string;
            stderr: string;
        }>;
    };
    dialogs: {
        message(options: {
            message: string;
            title?: string;
            detail?: string;
            buttons?: string[];
        }): Promise<{
            response: number;
            checkboxChecked: boolean;
        }>;
        open(options?: FileDialogOptions & {
            directory?: boolean;
            multiple?: boolean;
        }): Promise<{
            canceled: boolean;
            filePaths: string[];
        }>;
        save(options?: FileDialogOptions): Promise<{
            canceled: boolean;
            filePath?: string;
        }>;
    };
    notifications: {
        show(options: {
            id: string;
            title: string;
            body: string;
            silent?: boolean;
        }): Promise<true>;
        onClick(callback: (event: {
            id: string;
        }) => void): () => void;
    };
    screen: {
        displays(): Promise<SdkDisplay[]>;
        cursor(): Promise<SdkPoint>;
        convertPoint(point: SdkPoint, to: 'dip' | 'screen'): Promise<SdkPoint>;
        sources(): Promise<{
            id: string;
            name: string;
            displayId: string;
            thumbnail: string;
            icon?: string;
        }[]>;
        capture(options: {
            sourceId: string;
            width?: number;
            height?: number;
            region?: SdkRect;
        }): Promise<{
            data: Uint8Array;
            size: {
                width: number;
                height: number;
            };
        }>;
        select(options: TaskOptions & {
            displayId?: number;
        }): Promise<{
            data: Uint8Array;
            region: SdkRect;
            displayId: number;
        } | null>;
        pickColor(options: TaskOptions & {
            displayId?: number;
        }): Promise<{
            point: SdkPoint;
            hex: string;
        } | null>;
    };
    tasks: {
        cancel(id: string): Promise<boolean>;
        onProgress(callback: (event: {
            id: string;
            value: unknown;
        }) => void): () => void;
    };
    database: {
        get(id: string): Promise<SdkDocument | null>;
        put(document: SdkDocumentWrite): Promise<SdkDocument>;
        bulk(documents: SdkDocumentWrite[]): Promise<SdkDocument[]>;
        query(options?: {
            prefix?: string;
            after?: string;
            limit?: number;
        }): Promise<SdkDocument[]>;
        remove(id: string, rev: string): Promise<boolean>;
        getAttachment(id: string, name: string): Promise<{
            mime: string;
            data: Uint8Array;
        } | null>;
        putAttachment(id: string, rev: string, name: string, mime: string, data: Uint8Array): Promise<SdkDocument>;
        removeAttachment(id: string, rev: string, name: string): Promise<SdkDocument>;
    };
    backend: {
        call(request: TaskOptions & {
            method: string;
            args?: SdkJson;
        }): Promise<unknown>;
        stop(): Promise<true>;
    };
    schedules: {
        list(): Promise<Schedule[]>;
        set(schedule: Schedule): Promise<true>;
        remove(id: string): Promise<boolean>;
    };
}
export interface SdkPoint {
    x: number;
    y: number;
}
export interface SdkRect extends SdkPoint {
    width: number;
    height: number;
}
export interface SdkDisplay {
    id: number;
    label: string;
    bounds: SdkRect;
    workArea: SdkRect;
    scaleFactor: number;
    rotation: number;
}
export interface FileDialogOptions {
    title?: string;
    defaultPath?: string;
    filters?: {
        name: string;
        extensions: string[];
    }[];
}
export interface PluginInputExtensions {
    paste(): Promise<true>;
    /** Native key code: macOS virtual key, Windows virtual key, Linux X11 keycode. */
    key(options: {
        code: number;
        modifiers?: ('control' | 'shift' | 'alt' | 'meta')[];
    }): Promise<true>;
    mouse(options: {
        action: 'move' | 'click' | 'doubleClick' | 'down' | 'up' | 'scroll';
        x?: number;
        y?: number;
        button?: 'left' | 'right' | 'middle';
        delta?: number;
    }): Promise<true>;
    drag(options: {
        files: string[];
        icon?: string;
    }): Promise<true>;
}
export interface PluginClipboardExtensions {
    snapshot(): Promise<string | null>;
    writeTextIfUnchanged(token: string, text: string): Promise<boolean>;
    readImage(): Promise<Uint8Array | null>;
    writeImage(data: Uint8Array): Promise<true>;
    readFiles(): Promise<string[]>;
    writeFiles(files: string[]): Promise<true>;
}
export interface SdkFeature {
    code: string;
    name: string;
    keywords: string[];
    matches?: ({
        type: 'text';
        minLength?: number;
        maxLength?: number;
    } | {
        type: 'regex';
        pattern: string;
        flags?: string;
        minLength?: number;
        maxLength?: number;
    } | {
        type: 'image';
    } | {
        type: 'files';
        extensions?: string[];
        fileType?: 'file' | 'directory';
        minCount?: number;
        maxCount?: number;
    })[];
}
export interface ProviderConfig {
    baseUrl: string;
    apiKey?: string | null;
}
export interface ProviderStatus {
    configured: boolean;
    baseUrl?: string;
}
export interface ChatRequest {
    model: string;
    messages: Record<string, unknown>[];
    tools?: Record<string, unknown>[];
    [key: string]: unknown;
}
export interface ChatToolCall {
    id: string;
    type: string;
    function: {
        name: string;
        arguments: string;
    };
}
export interface ChatStreamResult {
    content: string;
    toolCalls: ChatToolCall[];
}
export interface ChatCompletion {
    id?: string;
    choices: {
        index?: number;
        message: {
            role?: string;
            content: string | null;
            tool_calls?: ChatToolCall[];
        };
        finish_reason?: string;
    }[];
    usage?: Record<string, number>;
    [key: string]: unknown;
}
export interface ImageMetadata {
    format?: string;
    width?: number;
    height?: number;
    channels?: number;
    [key: string]: unknown;
}
export interface ImageResult {
    data: Uint8Array;
    info: {
        format: string;
        width: number;
        height: number;
        channels: number;
        size: number;
        [key: string]: unknown;
    };
}
export interface SdkToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    method: string;
}
export type ImageOperation = 'resize' | 'rotate' | 'extract' | 'extend' | 'flip' | 'flop' | 'flatten' | 'blur' | 'sharpen' | 'threshold' | 'negate' | 'grayscale' | 'normalise' | 'tint' | 'gamma' | 'modulate' | 'linear' | 'recomb' | 'removeAlpha' | 'ensureAlpha' | 'trim';
export type BrowserAction = {
    type: 'navigate';
    url: string;
} | {
    type: 'show' | 'hide' | 'info' | 'screenshot';
} | {
    type: 'evaluate';
    script: string;
} | {
    type: 'wait' | 'click';
    selector: string;
} | {
    type: 'type';
    selector: string;
    text: string;
    clear?: boolean;
} | {
    type: 'input';
    event: Record<string, unknown>;
} | {
    type: 'pdf';
    landscape?: boolean;
} | {
    type: 'cookies';
    url?: string;
} | {
    type: 'setCookie';
    cookie: {
        url: string;
        name: string;
        value: string;
        domain?: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        expirationDate?: number;
        sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
    };
} | {
    type: 'removeCookie';
    url: string;
    name: string;
} | {
    type: 'proxy';
    rules?: string;
    bypass?: string;
} | {
    type: 'clear';
    cookies?: boolean;
} | {
    type: 'userAgent';
    value: string;
} | {
    type: 'files';
    selector: string;
    paths: string[];
} | {
    type: 'download';
    url: string;
    path: string;
};
export interface BrowserCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure: boolean;
    httpOnly: boolean;
    session: boolean;
    expirationDate?: number;
    sameSite: string;
}
export type BrowserResult<A extends BrowserAction> = A extends {
    type: 'navigate' | 'info';
} ? {
    url: string;
    title: string;
    loading?: boolean;
} : A extends {
    type: 'evaluate';
} ? unknown : A extends {
    type: 'screenshot' | 'pdf';
} ? Uint8Array : A extends {
    type: 'cookies';
} ? BrowserCookie[] : A extends {
    type: 'download';
} ? {
    path: string;
    bytes: number;
} : true;
