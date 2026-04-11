import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { arrayBuffer, buffer } from "stream/consumers";

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

  let imageData = await file.arrayBuffer();
  let bufferImageData = Buffer.from(imageData);
  let base64ImageData = bufferImageData.toString("base64");

  let videoMetadata = getVideo(cfg.db, videoId);
  if (videoMetadata?.userID != userID) {
    throw new UserForbiddenError("The user is not authorised");
  }

  const dataURL = `data:${mediaType};base64,${base64ImageData}`;

  videoMetadata.thumbnailURL = dataURL;

  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, videoMetadata);
}
