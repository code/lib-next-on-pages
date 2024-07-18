/**
 * The next-on-pages worker needs to isolate the global scope for each route, they all sharing the same global scope
 * allows for race conditions and incorrect behaviors (see: https://github.com/cloudflare/next-on-pages/issues/805)
 *
 * So we set up an isolation system in which each route can access a proxy to the global scope that is route-specific,
 * they can do that by calling `globalThis.getProxyFor(route)`.
 *
 * The following function sets up such utility alongside a map that is used to store the various proxies.
 */
export function setupRoutesIsolation() {
	globalThis.__nextOnPagesRoutesIsolation ??= {
		_map: new Map(),
		getProxyFor,
	};
}

/**
 * Utility to retrieve a route-specific proxy to the global scope, if the proxy doesn't yet exist it gets created
 * by the function.
 *
 * @param route the target route
 * @returns the proxy for the route
 */
function getProxyFor(route: string) {
	const existingProxy = globalThis.__nextOnPagesRoutesIsolation._map.get(route);
	if (existingProxy) {
		return existingProxy;
	}

	const newProxy = createNewRouteProxy();
	globalThis.__nextOnPagesRoutesIsolation._map.set(route, newProxy);
	return newProxy;
}

/**
 * Creates a new route-specific proxy to the global scope.
 *
 * How the proxy works: setters on the proxy don't set the values to the actual global scope but
 * in an internal map specific to the proxy. getters retrieve values from such internal map, and
 * fall back to the actual global scope for values not present in such map.
 *
 * This makes it so that routes trying to modify the global scope will, though this proxy, work
 * exactly like if they were actually updating the global scope, but without actually doing so,
 * thus not effecting any other route.
 *
 * Note: this does not account for routes trying to update already existing objects in the global
 * scope (e.g. `globalScope.existing_field.x = 123`), fortunately such granular control doesn't
 * seem necessary in next-on-pages.
 *
 * @returns the created proxy.
 */
function createNewRouteProxy() {
	const overrides = new Map<string | symbol, unknown>();

	return new Proxy(globalThis, {
		get: (_, property) => {
			if (overrides.has(property)) {
				return overrides.get(property);
			}
			return Reflect.get(globalThis, property);
		},
		set: (_, property, value) => {
			overrides.set(property, value);
			return true;
		},
	});
}

type RoutesIsolation = {
	_map: Map<string, unknown>;
	getProxyFor: (route: string) => unknown;
};

declare global {
	// eslint-disable-next-line no-var
	var __nextOnPagesRoutesIsolation: RoutesIsolation;
}
