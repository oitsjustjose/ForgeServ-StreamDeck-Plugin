/// <reference path="../../../libs/js/property-inspector.js" />
/// <reference path="../../../libs/js/utils.js" />

$PI.onConnected((jsn) => {
  const form = document.querySelector('#property-inspector');
  const { actionInfo, appInfo, connection, messageType, port, uuid } = jsn;
  const { payload, context } = actionInfo;
  const { settings } = payload;

  Utils.setFormValue(settings, form);

  form.addEventListener(
    'input',
    Utils.debounce(150, () => {
      const value = Utils.getFormValue(form);
      $PI.setSettings(value);
      $PI.sendToPlugin({ value });
    })
  );
});

$PI.onDidReceiveGlobalSettings(({ payload }) => {
  console.log('onDidReceiveGlobalSettings', payload);
});

/**
 * Provide window level functions to use in the external window
 * (this can be removed if the external window is not used)
 */
window.sendToInspector = (data) => {
  console.log(data);
};

