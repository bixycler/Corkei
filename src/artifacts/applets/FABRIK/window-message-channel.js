/**
 * Update height of <details> following the embedded page
 * @type {import('./window-message-channel.d.ts').syncHeight}
 */
export function syncHeight(details, iframe) {
  const channel = new MessageChannel(), remotePort = [channel.port2], localPort = channel.port1;
  // Transfer message port to iframe
  details.addEventListener('toggle', (e)=>{
    try {
      details.open && iframe.contentWindow && iframe.contentWindow.postMessage("Transferring message port", "*", remotePort);
    }catch(ex){
      if (ex instanceof Error) {
        !ex.message.match('neutered') && console.debug('Error transferring message port: ', ex);
      }
    }
  });
  // Receive message from iframe
  localPort.onmessage = (event)=>{
    //console.debug('localPort: ',event);
    if (event.data.pageHeight && iframe) {
      iframe.style.height = `${event.data.pageHeight + 100}px`;
    }
  };
}

/**
 * Inform the container about the height of this embedded page
 * @type {import('./window-message-channel.d.ts').responseHeight}
*/
export function responseHeight(pageId) {
  let contentHeight = -1; // document.body.offsetHeight; // getBoundingClientRect().height;
  let messagePort = null;

  window.addEventListener("message", (event)=>{
    //console.debug('Remote page received message: ', event);
    if(event.origin !== window.origin || event.source !== window.parent){ return };
    messagePort = event.ports?.[0];
    contentHeight = document.body.offsetHeight;
    postPageHeight(contentHeight);
  });

  function postPageHeight(height){
    messagePort && messagePort.postMessage({ pageHeight: height, pageId: pageId });
    //console.debug('postPageHeight: ',height);
  }

  // Watch for document.body's height change
  const observer = new MutationObserver((mutations) => {
    const currentBodyHeight = document.body.offsetHeight;
    if (currentBodyHeight !== contentHeight) {
      contentHeight = currentBodyHeight;
      postPageHeight(contentHeight);
    }
  });
  observer.observe(document.body, {
    attributes: true, // Observe attribute changes (e.g., style)
    childList: true, // Observe direct child additions/removals
    subtree: true // Observe changes in descendants
  });

}