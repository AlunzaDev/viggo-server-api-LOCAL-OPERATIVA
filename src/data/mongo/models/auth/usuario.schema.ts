import { Schema, model } from "mongoose";

import {
  AUTH_ROLES,
  AUTH_ROLE_VALUES,
  USER_APP_VALUES,
} from "../../../../domain/constants";

const userAppPermissionSchema = new Schema(
  {
    app: {
      type: String,
      required: [true, "La aplicación es obligatoria"],
      enum: USER_APP_VALUES,
    },

    permissionProfileId: {
      type: String,
      required: [true, "El perfil de permisos es obligatorio"],
      trim: true,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const usuarioSchema = new Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre es obligatorio"],
      trim: true,
    },

    apellido: {
      type: String,
      required: [true, "El apellido es obligatorio"],
      trim: true,
    },

    correo: {
      type: String,
      required: [true, "El correo es obligatorio"],
      unique: true,
      trim: true,
      lowercase: true,
    },

    emailValidated: {
      type: Boolean,
      default: false,
    },

    emailValidationToken: {
      type: String,
      default: undefined,
    },

    emailValidationExpiresAt: {
      type: Date,
      default: undefined,
    },

    telefono: {
      type: String,
      required: [true, "El teléfono es obligatorio"],
      unique: true,
      trim: true,
    },

    coordinates: {
      type: [Number],
      required: false,
    },

    password: {
      type: String,
      required: [true, "La contraseña es obligatoria"],
    },

    passwordResetToken: {
      type: String,
      default: undefined,
    },

    passwordResetExpiresAt: {
      type: Date,
      default: undefined,
    },

    rol: {
      type: String,
      required: true,
      default: AUTH_ROLES.CLIENT,
      enum: AUTH_ROLE_VALUES,
    },

    parkings: {
      type: [String],
      default: () => [],
    },

    allowedApps: {
      type: [String],
      default: () => [],
      enum: USER_APP_VALUES,
    },

    appPermissions: {
      type: [userAppPermissionSchema],
      default: () => [],
    },

    nacimiento: {
      type: Number,
      required: false,
    },

    img: {
      type: String,
      default: "",
    },

    estado: {
      type: Boolean,
      default: true,
    },

    google: {
      type: Boolean,
      default: false,
    },

    barrierBlasterHighScore: {
      type: Number,
      default: 0,
      min: 0,
    },

    syncSource: {
      type: String,
      default: "administrativo",
    },

    lastSyncedAt: {
      type: Number,
      default: undefined,
    },

    lastCloudCheckAt: {
      type: Number,
      default: undefined,
    },
  },
  {
    versionKey: false,

    toJSON: {
      transform: (_document, result) => {
        const serialized = result as Record<string, unknown>;

        serialized.id = String(serialized._id);

        delete serialized._id;
        delete serialized.password;
        delete serialized.emailValidationToken;
        delete serialized.emailValidationExpiresAt;
        delete serialized.passwordResetToken;
        delete serialized.passwordResetExpiresAt;

        return serialized;
      },
    },
  },
);

export const UsuarioModel = model("Usuario", usuarioSchema);
