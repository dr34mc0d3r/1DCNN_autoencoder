import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/setup",     label: "Setup" },
  { to: "/train",     label: "Train" },
  { to: "/windows",   label: "Windows" },
  { to: "/latent",          label: "Latent Space" },
  { to: "/cluster-profile", label: "Cluster Profile" },
  { to: "/analysis",        label: "Analysis" },
  { to: "/inference", label: "Live Inference" },
];

export default function NavBar() {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
      <span className="text-indigo-400 font-bold text-lg mr-4">1DCNN-A v2</span>
      {LINKS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            isActive
              ? "text-indigo-400 text-sm font-semibold"
              : "text-gray-400 hover:text-gray-100 text-sm"
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
