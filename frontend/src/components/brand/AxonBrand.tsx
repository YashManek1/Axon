import { Link } from "react-router-dom";
import "./AxonBrand.css";

type AxonBrandProps = {
  className?: string;
  linkTo?: string | null;
};

export default function AxonBrand({ className = "", linkTo = "/" }: AxonBrandProps) {
  const mark = (
    <>
      <span className="axon-brand__tile" aria-hidden="true"><img src="/axon-logo.png" alt="" /></span>
      <span className="axon-brand__wordmark">Axon</span>
    </>
  );

  if (linkTo === null) {
    return <span className={["axon-brand", className].filter(Boolean).join(" ")}>{mark}</span>;
  }

  return (
    <Link className={["axon-brand", className].filter(Boolean).join(" ")} to={linkTo} aria-label="Axon home">
      {mark}
    </Link>
  );
}
