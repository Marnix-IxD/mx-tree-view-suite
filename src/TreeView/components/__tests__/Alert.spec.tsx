import { createElement } from "react";
import { shallow } from "enzyme";

describe("Alert", () => {
    it("renders the structure when an alert message is specified", () => {
        const message = "This is an error";
        const alert = shallow(
            <div></div> /* <Alert bootstrapStyle="danger" className="widget-badge-alert" message={message} />*/
        );

        expect(alert.equals(<div className="alert alert-danger widget-badge-alert">{message}</div>)).toEqual(true);
    });

    it("renders no structure when the alert message is not specified", () => {
        const alert = shallow(<div></div> /* <Alert bootstrapStyle="danger" />*/);

        expect(alert.isEmptyRender()).toEqual(true);
    });
});
