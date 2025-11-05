export interface UploadedFile {
    url: string;
    originalName: string;
    size: number;
    mimeType: string;
}

export interface UploadOptions {
    folder: string;
    filename?: string;
    contentType: string;
}

// Расширяем тип Multer.File для S3
export interface MulterS3File extends Express.Multer.File {
    location?: string;
    key?: string;
    bucket?: string;
    etag?: string;
}