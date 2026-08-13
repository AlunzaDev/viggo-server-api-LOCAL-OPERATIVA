import { RemoteSupportService } from "../../services/remote-support/remote-support.service";

export class ResolveRemoteSupportDeviceUseCase {
  constructor(private readonly remoteSupportService: RemoteSupportService) {}

  execute(moduleId: string) {
    return this.remoteSupportService.resolveModuleDevice(moduleId);
  }
}