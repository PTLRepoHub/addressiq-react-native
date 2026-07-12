// Minimal `react-native` stub for the native-free jest smoke tests. Only the
// surface the tested modules touch is provided.
module.exports = {
  Platform: { OS: 'ios', select: (obj) => obj.ios ?? obj.default },
};
