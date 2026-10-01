import { describe, expect, it } from "vitest";
import {
  ORDER_FLOW,
  flowStep,
  isClosed,
  maskAddress,
  maskName,
  maskPhone,
  shippingGateLabel,
  statusDescription,
  statusLabel
} from "../lib/order-status";

describe("訂單狀態標籤與進度", () => {
  it("已知狀態有中文標籤，未知狀態原樣顯示", () => {
    expect(statusLabel("purchasing")).toBe("日本採購中");
    expect(statusLabel("customs_clearance")).toBe("海關報關中");
    expect(statusLabel("something_new")).toBe("something_new");
    expect(statusLabel(null)).toBe("狀態不明");
  });

  it("每個狀態都有說明（客戶看得懂現在怎麼了）", () => {
    for (const status of ORDER_FLOW) {
      expect(statusDescription(status), status).toBeTruthy();
    }
  });

  it("進度依流程遞增；取消與異常不算在正常流程內", () => {
    expect(flowStep("pending")).toBe(1);
    expect(flowStep("paid")).toBe(3);
    expect(flowStep("completed")).toBe(ORDER_FLOW.length);
    expect(flowStep("cancelled")).toBe(0);
    expect(flowStep("customs_problem")).toBe(0);
    expect(flowStep(null)).toBe(0);
  });

  it("已結束的狀態", () => {
    expect(isClosed("completed")).toBe(true);
    expect(isClosed("cancelled")).toBe(true);
    expect(isClosed("purchasing")).toBe(false);
  });

  it("運費閘門標籤（預設 pending）", () => {
    expect(shippingGateLabel("pending")).toBe("運費待確認");
    expect(shippingGateLabel("confirmed")).toBe("運費已確認，待補款");
    expect(shippingGateLabel("paid")).toBe("運費已補款");
    expect(shippingGateLabel(null)).toBe("運費待確認");
  });
});

describe("個資遮罩", () => {
  it("姓名遮罩保留首字", () => {
    expect(maskName("王小明")).toBe("王○○");
    expect(maskName("王")).toBe("王");
    expect(maskName("")).toBe("—");
    expect(maskName(null)).toBe("—");
    expect(maskName("Alexander")).toBe("A○○○");
  });

  it("手機遮罩只留前 4 與後 3 碼", () => {
    expect(maskPhone("0912345678")).toBe("0912***678");
    expect(maskPhone("0912-345-678")).toBe("0912***678");
    expect(maskPhone("123")).toBe("—");
  });

  it("地址遮罩保留前 6 字（短地址保留前 3 字）", () => {
    expect(maskAddress("台北市大安區信義路四段100號")).toBe("台北市大安區***");
    expect(maskAddress("台北市")).toBe("台北市***");
    expect(maskAddress(null)).toBe("—");
  });
});
