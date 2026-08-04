export enum Platform {
	Unknown,
	Windows,
	Mac,
	Linux,
}

function getPlatform(): Platform {
	switch (process.platform) {
		case "win32":
			return Platform.Windows;
		case "darwin":
			return Platform.Mac;
		case "linux":
			return Platform.Linux;
		default:
			return Platform.Unknown;
	}
}

export default getPlatform;
