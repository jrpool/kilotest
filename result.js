/*
  result.js

  Makes the result page subscribe to server-sent events and update its status whenever it receives
  an event addressed to it.
*/

// CONSTANTS

const jobID = document.getElementById('jobID').textContent;

// FUNCTIONS

// Handles a message event.
const handleMessage = event => {
  // If the message has content:
  const {data} = event;
  if (data) {
    // Add a paragraph with the received text to the result.
    const newStatusP = document.createElement('p');
    document.getElementById('status').insertAdjacentElement('beforeend', newStatusP);
    newStatusP.innerHTML = data;
    // Scroll to make the added paragraph visible.
    newStatusP.scrollIntoView({behavior: 'smooth'});
  }
};
// After the DOM has loaded:
document.addEventListener('DOMContentLoaded', () => {
  // Request an event stream and listen for messages on it.
  const source = new EventSource(`/testu/status?jobID=${jobID}`);
  source.addEventListener('message', event => {
    handleMessage(event);
    if (event.data.includes('digested')) {
      source.close();
    }
  });
  source.onerror = error => {
    console.log(`ERROR: Status stream failed (${error.message})`);
    source.close();
  }
});
