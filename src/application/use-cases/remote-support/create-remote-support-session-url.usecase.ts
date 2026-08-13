import { RemoteSupportService } from "../../services/remote-support/remote-support.service";

export class CreateRemoteSupportSessionUrlUseCase {
  constructor(private readonly remoteSupportService: RemoteSupportService) {}

  execute(moduleId: string, viewModeInput: unknown = 10) {
    return this.remoteSupportService.createModuleSessionUrl(moduleId, viewModeInput);
  }

  executeForProject(projectId: string) {
    return this.remoteSupportService.createProjectSessionUrl(projectId);
  }
}
