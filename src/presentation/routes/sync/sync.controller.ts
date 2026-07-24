import { Request, Response } from "express";
import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { ErrorService } from "../../services/error.service";
import { SyncRequest } from "../../middlewares";

type SnapshotItem = Record<string, unknown> & { id?: unknown; _id?: unknown };

const getSnapshotId = (item: SnapshotItem): string => {
  const id = item.id ?? item._id;
  return typeof id === "string" ? id.trim() : "";
};

const toObjectIdUpdate = (item: SnapshotItem) => {
  const { id, _id, ...rest } = item;
  return {
    _id: getSnapshotId(item),
    ...rest,
  };
};

export class SyncController {
  status = async (req: Request, res: Response) => {
    return res.status(200).json({
      service: "viggo-localope-sync",
      source: (req as SyncRequest).syncSource,
      status: "ok",
      serverTime: Date.now(),
    });
  };

  applyAccessSnapshot = async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        version?: unknown;
        users?: SnapshotItem[];
        permissionProfiles?: SnapshotItem[];
      };
      const users = Array.isArray(body.users) ? body.users : [];
      const permissionProfiles = Array.isArray(body.permissionProfiles)
        ? body.permissionProfiles
        : [];

      const validUsers = users.filter((item) => getSnapshotId(item));
      const validProfiles = permissionProfiles.filter((item) => getSnapshotId(item));

      await Promise.all([
        ...validProfiles.map((profile) =>
          PermissionProfileModel.findByIdAndUpdate(
            getSnapshotId(profile),
            toObjectIdUpdate(profile),
            { upsert: true, new: true, setDefaultsOnInsert: true },
          ),
        ),
        ...validUsers.map((user) =>
          UsuarioModel.findByIdAndUpdate(getSnapshotId(user), toObjectIdUpdate(user), {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }),
        ),
      ]);

      return res.status(200).json({
        applied: true,
        version: body.version ?? null,
        users: validUsers.length,
        permissionProfiles: validProfiles.length,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}

