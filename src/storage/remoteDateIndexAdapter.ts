import type { RemoteDateIndexPort } from "../domain/notes/remoteDateIndexPort";
import {
  getRemoteDatesForYear,
  setRemoteDatesForYear,
  hasRemoteDate,
  deleteRemoteDate,
} from "./remoteNoteIndexStore";

export function createRemoteDateIndexAdapter(): RemoteDateIndexPort {
  return {
    getDatesForYear: getRemoteDatesForYear,
    setDatesForYear: setRemoteDatesForYear,
    hasDate: hasRemoteDate,
    deleteDate: deleteRemoteDate,
  };
}
