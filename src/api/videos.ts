import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import { S3Client, type BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getUser } from "../db/users";
import { getVideo, updateVideo } from "../db/videos";
import { rm } from "fs/promises";

export async function uploadVideoToS3(
  cfg: ApiConfig,
  key: string,
  processFilePath: string,
  contentType: string,
) {
  const s3file = cfg.s3Client.file(key, {
    bucket: cfg.s3Bucket,
  });
  const videoFile = Bun.file(processFilePath);
  await s3file.write(videoFile, { type: contentType });
}

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30;

  const { videoId } = req.params as { videoId?: string };

  if (videoId == undefined) {
    throw new BadRequestError("Video id does not exists");
  }

  const bearerToken = getBearerToken(req.headers);
  const userID = validateJWT(bearerToken, cfg.jwtSecret);

  const videoMetadata = getVideo(cfg.db, videoId);

  if (!videoMetadata) {
    throw new NotFoundError("No video metadata");
  }

  if (videoMetadata?.userID != userID) {
    throw new UserForbiddenError("The user is not correct");
  }

  const formData = await req.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) {
    throw new BadRequestError("Video file missing");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File size exceed amximum accepted");
  }

  if (file.type != "video/mp4") {
    throw new BadRequestError("the file tpe is wrong");
  }

  const tempFilePath = `${cfg.assetsRoot}/temp/${videoId}.mp4`;
  
  Bun.write(tempFilePath, file);

  const processedFilePath = await processVideoForFastStart(tempFilePath);

  const key = `${videoId}.mp4`;
  await uploadVideoToS3(cfg, key, processedFilePath, "video/mp4");

  
  await uploadVideoToS3(cfg, key, tempFilePath, "video/mp4");

  const videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${key}`;
  videoMetadata.videoURL = videoURL;
  updateVideo(cfg.db, videoMetadata);

  await Promise.all([
    rm(tempFilePath, { force: true }),
    rm(`${tempFilePath}.processed.mp4`, { force: true }),
  ]);

  return respondWithJSON(200, videoId);
}


export async function processVideoForFastStart(inputFilePath: string) {
  const processedFilePath = `${inputFilePath}.processed.mp4`;

  const process = Bun.spawn(
    [
      "ffmpeg",
      "-i",
      inputFilePath,
      "-movflags",
      "faststart",
      "-map_metadata",
      "0",
      "-codec",
      "copy",
      "-f",
      "mp4",
      processedFilePath,
    ],
    { stderr: "pipe" },
  );

  const errorText = await new Response(process.stderr).text();
  const exitCode = await process.exited;
if (exitCode !== 0) {
    throw new Error(`FFmpeg error: ${errorText}`);
  }

  return processedFilePath;
}
