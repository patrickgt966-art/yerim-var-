import ExpoModulesCore
import MapKit

/// Car parks near a point from Apple Maps (MKLocalPointsOfInterestRequest).
/// Runs on the device; Apple receives only the search region. Returns name,
/// coordinate and a one-line address. No occupancy, capacity or price.
public final class YerimMapKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("YerimMapKit")

    AsyncFunction("searchParkingAsync") { (latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [[String: Any]] in
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      // Apple caps the radius; keep it in a sane walking range.
      let radius = min(max(radiusMeters, 100), 5_000)
      let request = MKLocalPointsOfInterestRequest(center: center, radius: radius)
      request.pointOfInterestFilter = MKPointOfInterestFilter(including: [.parking])

      let response: MKLocalSearch.Response
      do {
        response = try await MKLocalSearch(request: request).start()
      } catch let error as MKError where error.code == .placemarkNotFound {
        // "Nothing here" is a normal answer, not a failure.
        return []
      }
      return response.mapItems.compactMap { item -> [String: Any]? in
        let coordinate = item.placemark.coordinate
        guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
        let placemark = item.placemark
        let address = [placemark.thoroughfare, placemark.subThoroughfare, placemark.locality]
          .compactMap { $0 }
          .joined(separator: " ")
        return [
          "name": item.name ?? "",
          "latitude": coordinate.latitude,
          "longitude": coordinate.longitude,
          "address": address,
        ]
      }
    }
  }
}
