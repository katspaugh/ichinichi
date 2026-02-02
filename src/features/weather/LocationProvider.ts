import {
  type ApproxLocation,
  type Coordinates,
  type LocationPermissionState,
  locationService,
} from "../../services/locationService";

export type { ApproxLocation, Coordinates, LocationPermissionState };

export class LocationProvider {
  async getApproxLocation(): Promise<ApproxLocation | null> {
    return locationService.getApproxLocation();
  }

  async getPreciseLocation(): Promise<Coordinates | null> {
    return locationService.getCurrentPosition();
  }

  async getPermissionState(): Promise<LocationPermissionState> {
    return locationService.getPermissionState();
  }

  async shouldShowPrompt(): Promise<boolean> {
    return locationService.shouldShowPrompt();
  }

  markPromptShown(): void {
    locationService.setPromptShown();
  }
}
