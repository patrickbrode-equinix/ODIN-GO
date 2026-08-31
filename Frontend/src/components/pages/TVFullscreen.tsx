/* ------------------------------------------------ */
/* TV FULLSCREEN PAGE (FIXED HEIGHT)                */
/* ------------------------------------------------ */

import { TVContent } from "../tv/TVContent";

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

function TVFullscreen() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex flex-col">
      <TVContent isFullscreen />
    </div>
  );
}

/* ------------------------------------------------ */
/* EXPORT                                           */
/* ------------------------------------------------ */

export default TVFullscreen;
