import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo, type Video } from "../db/videos";
import { cfg, type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { arrayBuffer, buffer } from "stream/consumers";
import { randomBytes } from "crypto";

const MAX_UPLOAD_SIZE = 10;

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  /*
  this function miight want to be deleted
  */
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }

  if (file.size > MAX_UPLOAD_SIZE * 1024 * 1024) {
    throw new BadRequestError("File size exceed maximum accepted");
  }

  const mediaType = file.type;

  if (mediaType != "image/jpeg" && mediaType != "image/png") {
    throw new BadRequestError("the file type is wrong");
  }

  let imageData = await file.arrayBuffer();
  let bufferImageData = Buffer.from(imageData);

  let videoMetadata = getVideo(cfg.db, videoId);
  if (videoMetadata?.userID != userID) {
    throw new UserForbiddenError("The user is not authorised");
  }

  const fileName = `${randomBytes(32).toString("base64url")}.${mediaType.split("/")[1]}`;
  const filePath = `${cfg.assetsRoot}/${fileName}`;

  const thumbnailURL = `http://localhost:${cfg.port}/assets/${fileName}`;

  videoMetadata.thumbnailURL = thumbnailURL;

  await Bun.write(filePath, bufferImageData);

  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, videoMetadata);
}
